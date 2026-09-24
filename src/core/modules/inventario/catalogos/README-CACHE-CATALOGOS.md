# Caché de catálogos públicos: precio y stock al día

Esta funcionalidad mantiene actualizados, en Redis, los catálogos que muestra el portal web
(`page-diquimec`): precio por presentación (fijo o por % de utilidad), stock y datos del
producto. No refresca a ciegas cada pocos minutos: la base de datos anota qué productos
cambiaron, y Nest recalcula solo los catálogos que los contienen.

---

## 1. Problema que resuelve

| Antes | Ahora |
|---|---|
| El catálogo solo tomaba configuraciones de **precio fijo**; los productos con **% de utilidad** salían con precio 0 y el portal ocultaba sus presentaciones. | El precio sale de `f_calcula_precio_venta`, la misma función que usa la calculadora de proformas y el POS: precio fijo o costo PPMP × (1 + %). |
| La caché pública (`catalogo:path:*`) vencía cada 10 min y se recalculaba aunque nada hubiera cambiado. | Se recalcula solo cuando cambia algo que el catálogo muestra, y se **reemplaza** la clave: el portal nunca encuentra la caché vacía. |
| Una anulación hecha en sigafi no se reflejaba hasta que vencía la caché. | Un trigger de la BD detecta todas las escrituras, vengan del ERP (Nest), de sigafi o de SQL manual. |

---

## 2. Arquitectura

```
ERP (Nest) ─┐
sigafi     ─┼─► INSERT / UPDATE / DELETE en tablas de inventario
SQL manual ─┘            │
                         ▼   (dentro de la misma transacción)
        trigger fn_trg_catalogo_pendiente
        └─ ¿el artículo está en algún catálogo? (EXISTS con índice)
           └─ sí → INSERT INTO inv_catalogo_pendiente (ide_inarti, origen_incpe)
                         │   (la fila solo es visible si la transacción hace COMMIT)
                         ▼
Nest · CatalogosCacheService
   tick cada 1 min (solo en memoria) ── ¿pasaron p_inv_catalogo_refresco_min minutos?
                         │ sí
                         ▼
   1. SELECT de pendientes (pool normal, compatible con PgBouncer)
   2. ¿qué catálogos contienen esos productos?  (1 consulta)
   3. recalcula cada catálogo en caché → SET (reemplaza) en Redis, TTL 25 h
   4. borra la caché del bot de WhatsApp (catalogo:bot:productos:*)
   5. DELETE de los pendientes procesados (solo si todo salió bien)
                         ▼
Portal web → getCatalogoByPath → Redis (siempre con datos)
```

Además:
- **Al arrancar Nest** y **todos los días a las 00:05** se recalculan todos los catálogos en
  caché. El IVA vigente (`con_porcen_impues`) cambia por fecha sin que ningún registro lo
  anote, así que lo cubre el recálculo diario.
- **Botón "Actualizar portal"** en el ERP (Inventario → Catálogos): recalcula todo de inmediato.

---

## 3. Componentes

### 3.1 Base de datos: `scripts/core/modules/inventario/catalogos/catalogo-cache-pendiente.sql`

| Objeto | Qué hace |
|---|---|
| `inv_catalogo_pendiente` | Tabla de productos pendientes: `ide_incpe` (BIGSERIAL), `ide_inarti`, `origen_incpe` (tabla que originó el cambio), `fecha_ingre`. |
| `idx_inv_det_catalogo_inarti` | Índice en `inv_det_catalogo(ide_inarti)` para el `EXISTS` del trigger. |
| `fn_trg_catalogo_pendiente()` | Función del trigger. Anota el `ide_inarti` solo si el artículo está en algún catálogo. |
| `trg_catalogo_pendiente_det` | `inv_det_comp_inve`, AFTER INSERT/UPDATE/DELETE: compras, ventas, NC, ajustes y egresos (cambian stock y costo PPMP). |
| `trg_catalogo_pendiente_cab` | `inv_cab_comp_inve`, AFTER UPDATE OF `ide_inepi` y solo si el estado cambia: anulación o reactivación (ERP o sigafi). Anota todos los artículos de catálogo del comprobante. |
| `trg_catalogo_pendiente_precio` | `inv_conf_precios_articulo`, AFTER INSERT/UPDATE/DELETE: precio fijo o % de utilidad. |
| `trg_catalogo_pendiente_art` | `inv_articulo`, AFTER UPDATE solo de las columnas visibles en el catálogo (nombre, fotos, activo, descripción, unidad, etc.). Contadores como `total_vistas_inarti` **no** lo disparan. |

Detalles de la función:
- Si un `UPDATE` cambia el artículo de una línea (`OLD.ide_inarti ≠ NEW.ide_inarti`), se anotan
  los dos, porque cambió el stock de ambos.
- `RETURN NULL`: en un trigger AFTER el valor de retorno se ignora.
- **No toca `trg_kardex_ppmp`.** Nest lee los pendientes después del COMMIT, cuando ese trigger
  ya recalculó el costo PPMP, así que el precio por % sale con el costo nuevo.

### 3.2 Función de precio: `scripts/core/modules/inventario/f_calcular_precio_venta.sql`

Cambio en la **prioridad 1** (configuración de cantidad exacta):
- Antes: si la configuración exacta no tenía precio fijo, lanzaba
  `RAISE EXCEPTION 'Configuración exacta encontrada pero sin precio fijo válido'`. En el
  catálogo, esa excepción abortaba la consulta completa.
- Ahora:
  - Una configuración exacta con **% de utilidad** calcula igual que la prioridad 2 y devuelve
    `tipo_configuracion = 'PORCENTAJE'`. Se reutiliza ese tipo porque la calculadora del ERP
    (`calcular-precios-dialog.tsx`) decide qué mostrar según ese valor.
  - Una configuración exacta **sin precio ni %** (la validación permite `precio_fijo = 0`) se
    salta, y la búsqueda sigue con las prioridades 2 a 4.
- Precio fijo y rangos siguen exactamente el mismo camino que antes.

> ⚠️ Antes de ejecutarlo, compara el script con la versión instalada en la BD
> (`SELECT pg_get_functiondef('f_calcula_precio_venta'::regproc);`). Si la de producción tiene
> cambios que no están en el repo, aplica solo el bloque de la prioridad 1.

### 3.3 Nest

| Archivo | Rol |
|---|---|
| `catalogos-cache.service.ts` | **`CatalogosCacheService`**: tick, lectura de pendientes, recálculo, refresco diario y al arrancar. |
| `catalogos.service.ts` | `construirCatalogoPublico(path, ideEmpr)` (arma el catálogo sin tocar la caché), constantes `CATALOGO_PATH_CACHE_PREFIX` y `CATALOGO_PATH_CACHE_TTL_SEG` (25 h), y `catalogoPathCacheKey()`. En `fetchCatalogoByPath` y `fetchCatalogoById`, el precio de cada presentación sale de `f_calcula_precio_venta`. |
| `catalogos-save.service.ts` | Al guardar, eliminar o activar un catálogo sigue **borrando** `catalogo:*` (cambió la estructura), pero ahora con `SCAN` en lugar de `KEYS`, para no bloquear Redis. |
| `catalogos.controller.ts` | `POST /api/inventario/catalogos/refrescarCacheCatalogos` con `{ todo?: boolean }`. |
| `dto/refrescar-cache-catalogos.dto.ts` | DTO del endpoint. |
| `variables/data/1-inv-var.ts` | Definición de la variable `p_inv_catalogo_refresco_min`. |

### 3.4 ERP (`react-front-erp`)

- `src/pages/inventario/catalogos/catalogo-list.tsx`: botón **"Actualizar portal"**, que llama al
  endpoint con `todo=true`.
- `src/api/modules/inventario/catalogos.ts`: función `refrescarCacheCatalogos()`.
- `src/pages/inventario/catalogos/catalogo-details.tsx`: se quitó el "precio tachado" de
  descuento, porque comparaba el precio unitario con el total de la presentación.

### 3.5 Portal web (`page-diquimec`)

**No requiere cambios.** La respuesta mantiene los mismos campos (`precio_final`,
`precio_fijo`, `incluye_iva`, `nombre_cndfp`, `nombre_cncfp`). Solo cambian dos significados:
`precio_fijo` es ahora el precio unitario sin IVA de la configuración aplicada, e
`incluye_iva` siempre es `true`, porque `precio_final` ya incluye el IVA. El portal solo usa
`precio_final`.

---

## 4. Parámetro: `p_inv_catalogo_refresco_min`

| Propiedad | Valor |
|---|---|
| Módulo | Inventario |
| Alcance | Global (`es_empr_para = false`) |
| Valor por defecto | `30` (30 minutos) |
| Rango válido | 1 a 720 minutos. Fuera de ese rango se ajusta al límite; si no es un número o no existe, se usa 30. |
| ¿Requiere reiniciar Nest? | **No.** El valor se relee como máximo cada 5 minutos. |

Para crearla en la BD, ejecuta la sincronización de variables del sistema
(`POST /api/sistema/variables/updateVariables`, o la opción equivalente del ERP), que inserta las
definiciones nuevas de `1-inv-var.ts`. Mientras no exista, se usa 30 (el valor por defecto del código).

### Análisis del intervalo

Volumen actual: unos 10 catálogos, el mayor con 15 productos. Eso da menos de 150
presentaciones y un recálculo completo de pocos segundos como máximo.

| Aspecto | Qué implica el intervalo |
|---|---|
| **Carga sobre la BD** | Casi nula con cualquier intervalo. El tick de 1 minuto no toca la BD; solo cuando se cumple el intervalo se hace un `SELECT` sobre una tabla casi vacía, y el recálculo ocurre únicamente si hubo cambios. Bajar el intervalo **no** agrega carga significativa. |
| **Cuánto tarda en verse un cambio** | Hasta el valor del intervalo. Con 30, una compra que cambia el costo (y el precio por %) o una venta que agota un producto se ven en el portal **hasta 30 min después**. |
| **Impacto de que el dato esté desactualizado** | El portal es de **cotización**: no valida stock y el precio final lo confirma la proforma, que recalcula con `f_calcula_precio_venta`. Un precio o una etiqueta EN STOCK/AGOTADO de hasta 30 min no provoca cobros erróneos, pero el cliente puede ver un precio distinto al de la proforma. |
| **Cambios urgentes** | El botón **"Actualizar portal"** del ERP los aplica al instante, sin esperar el intervalo. |

**Valor elegido: 30 min.** Con el volumen actual, un cambio llega al portal en media hora sin
carga apreciable: la carga depende de cuántos cambios hay, no de cada cuánto se revisa. Para
cambios urgentes (una compra que cambia costos, un ajuste de precios) está el botón
"Actualizar portal". Se puede subir, hasta 720, si en algún momento se quiere reducir aún más
la actividad.

---

## 5. Garantías y manejo de fallas

| Situación | Comportamiento |
|---|---|
| La transacción del ERP hace ROLLBACK | La fila anotada se descarta con ella; no se refresca nada. |
| Dos ventas simultáneas del mismo producto | Cada una **inserta** su fila; no hay UPDATE, UNIQUE ni `ON CONFLICT`, así que no se esperan entre sí. Los repetidos se eliminan en Nest. |
| Falla el recálculo de un catálogo | No se borran los pendientes (se reintenta en la próxima vuelta) y la caché anterior sigue sirviendo. Queda un aviso en el log. |
| Nest estuvo apagado | Los pendientes quedan en la tabla. Al arrancar se recalcula todo y se borran los pendientes leídos. |
| Llega un cambio durante un refresco | Se borran solo los ids que se leyeron, así que la fila nueva queda para la próxima vuelta. |
| El script SQL todavía no se ejecutó | Nest registra una advertencia una sola vez y sigue funcionando con el refresco diario, el de arranque y el botón. |
| Refrescos simultáneos (tick, botón y diario) | Exclusión en memoria: quien llega mientras hay uno en curso recibe el resultado de ese mismo refresco. Nest corre en una sola instancia (PM2 fork). |
| El catálogo se desactiva o deja de ser público | El recálculo devuelve `null` y se borra la clave. |
| El catálogo no está en caché | No se recalcula; la primera petición del portal lo arma con datos nuevos. |

Riesgo para la facturación: la función solo hace `EXISTS` con índice e `INSERT` de una fila
pequeña, y únicamente para productos que están en catálogos. No lanza excepciones en
condiciones normales y no tiene bloque `EXCEPTION`, que en PL/pgSQL crearía una
subtransacción por cada fila de movimiento.

---

## 6. Despliegue

1. **Base de datos** (en este orden):
   1. `scripts/core/modules/inventario/catalogos/catalogo-cache-pendiente.sql`
   2. `scripts/core/modules/inventario/f_calcular_precio_venta.sql` (ver la advertencia de §3.2)
2. **nest-core-api**: `deploy.sh`.
3. **Variable**: sincroniza las variables del sistema para crear `p_inv_catalogo_refresco_min`
   y ajusta su valor si hace falta.
4. **react-front-erp**: despliegue normal (botón "Actualizar portal").
5. En el log de Nest debe aparecer `[arranque] modo=todo ...`.

---

## 7. Verificación

```sql
-- Triggers instalados (deben ser 4)
SELECT tgname, tgrelid::regclass FROM pg_trigger WHERE tgname LIKE 'trg_catalogo_pendiente%';

-- Prueba de extremo a extremo (sobre un producto de catálogo, p. ej. 4238):
-- 1) Registra una compra o un ajuste de ese producto en el ERP, o anula uno en sigafi.
-- 2) Revisa que quedó anotado:
SELECT * FROM inv_catalogo_pendiente ORDER BY ide_incpe DESC LIMIT 10;
-- 3) En el ERP: Catálogos → "Actualizar portal" (o espera el intervalo).
-- 4) La tabla debe quedar vacía y el portal debe mostrar el precio y el stock nuevos.
```

Comparación de precio (debe coincidir con la calculadora de proformas):

```sql
SELECT precio_venta_con_iva, tipo_configuracion, rango_aplicado
FROM f_calcula_precio_venta(4238::int, 1::numeric, NULL::int, NULL::numeric, <IDE_EMPR>::bigint, NULL::bigint);
```

En el log de Nest, cada refresco con cambios deja una línea como:

```
[CatalogosCacheService] [programado] modo=pendientes pendientes=12 catalogos=2 errores=0 184ms
```

---

## 8. Operación y diagnóstico

| Necesidad | Cómo |
|---|---|
| Ver pendientes acumulados | `SELECT ide_inarti, origen_incpe, COUNT(*), MIN(fecha_ingre) FROM inv_catalogo_pendiente GROUP BY 1,2;` |
| Forzar el refresco | Botón "Actualizar portal", o `POST /api/inventario/catalogos/refrescarCacheCatalogos` con `{"todo": true}` (autenticado). |
| Procesar solo los pendientes | El mismo endpoint con `{"todo": false}`. |
| Cambiar la frecuencia | Edita `p_inv_catalogo_refresco_min`; se aplica en unos 5 minutos. |
| La tabla crece y no baja | Busca en el log de Nest `No se pudo recalcular` o `Refresco programado falló`. |

---

## 9. Alternativas descartadas

| Alternativa | Motivo |
|---|---|
| TTL fija de 10 min | Datos desactualizados hasta el vencimiento y recálculos aunque nada haya cambiado. |
| `pg_notify` + `LISTEN` | `LISTEN` necesita una conexión **exclusiva y persistente**. A través de PgBouncer en modo transacción (`DB_URL_POOL`) no funciona, y se decidió no abrir otra conexión a la BD. Además, pierde los avisos si Nest está caído. |
| Detectar los cambios en los endpoints de Nest | No ve las escrituras de sigafi (las anulaciones de inventario se siguen haciendo ahí), y cada endpoint nuevo tendría que acordarse de avisar. |
| Tabla de "versión por catálogo" con UPDATE | Todas las ventas actualizarían la misma fila y se bloquearían entre sí dentro de la facturación. |
| Tabla de precios y stock precalculados | Duplicaría la regla de precio y agregaría otra tabla que mantener sincronizada; no compensa con este volumen. |

---

## 10. Limitaciones conocidas

- El cambio de IVA por fecha se refleja con el recálculo diario de las 00:05, no al instante.
- `catalogo:buscar:*` (el buscador del portal) no se recalcula; vence sola a los 2 min.
- `getCatalogoCompleto` y `getCatalogoByPathAuth` (los que usa el ERP) no usan caché: siempre
  consultan en vivo.
- Si en el futuro Nest corre en **varias instancias**, la exclusión en memoria ya no alcanza.
  El resultado seguiría siendo correcto, porque recalcular dos veces no hace daño, pero conviene
  agregar un candado en Redis (`SET NX EX`).
