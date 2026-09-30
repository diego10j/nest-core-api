# Conciliación bancaria mensual (estados de cuenta de cualquier banco)

Estado: **Fase 1 implementada y verificada en local — pendiente de desplegar** (ver §5). Fase 2 sin
empezar (§7).

> No existía un plan previo de conciliaciones en este repo ni en el vault `erp-knowledge`: lo único
> que había eran las tablas legadas `tes_conciliacion_banco` / `tes_configura_conciliacion` (importación
> por número de columna, sin uso en el código) y el flujo simple "marcar movimientos como conciliados"
> de `pre-libro-bancos-conciliacion.service.ts`. Este documento es el plan de acción de la
> herramienta nueva.

## 1. Qué hace

Una **conciliación** es una cuenta bancaria del ERP (`tes_cuenta_banco`) + un **mes completo**, y se
hace una vez al mes por todas las cuentas.

1. **Cargar el estado de cuenta** (Excel, CSV o PDF). El sistema reconoce el banco por el contenido,
   detecta la cuenta del ERP por el número de cuenta, lee los movimientos y calcula saldo inicial y
   final del banco. El archivo original queda guardado y descargable.
2. **Cruce automático** contra el libro de bancos (`tes_cab_libr_banc`): por documento y por monto +
   fecha (±3 días, configurable por conciliación).
3. **Lo que no cruza solo**: sugerencias por suma (1 movimiento = varios) y sugerencias con **GPT**
   (beneficiario/concepto/diferencias pequeñas); cruce **manual** (N contra M) con justificación si los
   montos no coinciden; marcar movimientos del banco como *Falta en ERP* o *Ignorado*.
4. **Resultado**: saldos del banco vs ERP, diferencia y **qué la explica** (arrastre, banco sin ERP,
   ERP sin banco, cruces entre meses), movimientos conciliados / pendientes / faltantes.
5. **Cortes**: para cuentas como Deuna se puede subir el archivo a mitad de mes y otra vez a fin de
   mes: solo se agregan los movimientos nuevos (los ya cargados no se tocan, con sus cruces) y los
   saldos del banco se actualizan.
6. **Cerrar / reabrir / anular**. Cerrada = solo lectura. Anular libera todos los cruces.

Páginas (frontend `react-front-erp`): **Tesorería › Conciliación › Conciliación Bancaria**
- Lista: *Tablero del mes* (todas las cuentas de la sucursal con su estado) e *Historial*.
- Detalle: resumen de saldos, archivos cargados, pestañas *Por conciliar* / *Movimientos del banco* /
  *Cruces*, diálogo de *Sugerencias*.

## 2. Decisiones de diseño (y por qué)

| Decisión | Motivo |
|---|---|
| Tablas nuevas `tes_conciliacion`, `_archivo`, `_mov`, `_match`; **no** se reutilizan las legadas | Las legadas guardan un movimiento plano por número de columna: no sirven para varios cortes, saldos ni cruces N:M. Quedan intactas. |
| **`tes_cab_libr_banc` no se modifica** | Ya tiene `conciliado_teclb` y `fecha_concilia_teclb`; se mantienen sincronizados al cruzar/desconciliar (las pantallas y reportes que ya los usan siguen igual). La trazabilidad (quién, cómo, contra qué movimiento del banco) vive en `tes_conciliacion_match`. |
| El **número de cuenta** se lee de `tes_cuenta_banco.nombre_tecba` | Convención del ERP: el nombre lleva el número. Se comparan dígitos (bloques de 6+) en ambos sentidos, así tolera texto extra, ceros a la izquierda o números recortados. |
| Archivos en `PATH_DRIVE/tesoreria/conciliaciones/<cuenta>/<año-mes>/` (no `temp_media`) | `temp_media` se purga a los 90 días y la contadora necesita el respaldo indefinidamente. |
| Saldos del banco por **cadena de saldos** de los movimientos | Deuna no trae saldo inicial/final; el encabezado de Guayaquil es el saldo *al descargar*, no al fin del mes; Produbanco desordena los movimientos dentro del día. La cadena (saldo − monto = saldo anterior) no depende del orden. |
| Huella por movimiento `sha1(fecha, documento, monto con signo, saldo, ocurrencia)` | Permite re-subir cortes sin duplicar, incluso con movimientos idénticos el mismo día. |
| Un match = un par (movimiento banco, movimiento libro) con `grupo_tecmt` | Soporta 1:1, 1:N, N:1 y N:M con un solo esquema. Índice único: un movimiento del libro solo puede estar conciliado una vez (en cualquier conciliación). |
| Tolerancia por defecto **±3 días** y monto exacto | Configurable por conciliación (0–15). Montos repetidos (varias transferencias de 350,00) se cruzan por fecha más cercana y se marcan *ambiguos* para revisión. |
| Movimientos del banco sin registro en el ERP: **solo listar/marcar** | Decisión del usuario para esta fase (no se crean asientos desde la conciliación). |
| GPT solo **sugiere**; el servidor valida cada sugerencia (ids reales, sin repetir, mismo signo, diferencia ≤ 5,00) | La IA nunca concilia sola; nada llega a la BD sin confirmación del contador. |
| Identidad del resumen: `banco − ERP = arrastre + bancoSinErp − erpSinBanco + otras` | Para que el contador vea qué explica la diferencia; `otras` = cruces con meses vecinos y ajustes no listados. |

## 3. Formatos soportados

Reconocidos por **contenido**, no por nombre (`conciliacion-bancaria/parsers/`).

| Banco | Archivo | Cuenta se toma de | Notas |
|---|---|---|---|
| Banco Guayaquil | `.xlsx` "Consultar movimientos" | Encabezado `Cuenta:` | Monto positivo + columna Signo. |
| Produbanco | `.xlsx` "Reporte movimientos simples monetarios" | Fila `Cuenta:` | Fechas **mm/dd/yyyy**; total con signo. El xlsx usa prefijo `x:`, declara mal su rango (`A3:H10`) y las celdas de datos no traen coordenada → lector propio (`lector-xlsx.ts`, sobre `jszip`); `exceljs`/`xlsx` estándar no lo leen bien. |
| Banco Pichincha | `.csv` | **Nombre del archivo** (dígitos) | El CSV no trae cuenta ni periodo; si el nombre no la tiene se elige a mano. Montos con coma de miles. |
| Deuna | `.pdf` "Descarga de movimientos" | Encabezado `Cuenta:` | Números con coma decimal (1.958,63). No se usa `extraerTextoPdf` de base-tecnica: descarta como "repetidas" las filas de movimientos de las páginas 2+. |

Banco nuevo = un parser en esa carpeta (`esXxx` + `parsearXxx`) y una rama en
`estado-cuenta-parser.service.ts`; nada más cambia.

**Hallazgo con los archivos reales**: el PDF de Deuna de agosto tiene un salto de saldo de 0,02 el
31/08 (doc. 995256185145: el banco imprime 2.253,50, lo esperado era 2.253,48). Se avisa como
advertencia al cargar; los saldos inicial/final salen bien (1.861,63 → 1.958,63, y el saldo inicial
de septiembre es 1.958,63).

## 4. Backend (`nest-core-api`)

- Módulo: `src/core/modules/tesoreria/conciliacion-bancaria/` (registrado en `TesoreriaModule`).
  - `parsers/` lectura de archivos · `matching.ts` motor de cruces (puro, con `matching.spec.ts`) ·
    `conciliacion-bancaria.service.ts` consultas · `conciliacion-bancaria-save.service.ts` escrituras ·
    `conciliacion-bancaria.controller.ts` (`tesoreria/conciliacion-bancaria/*`).
- Migración: `scripts/core/modules/tesoreria/conciliacion_bancaria_migration.sql` (idempotente).
- Menú: ya está en `react-front-erp/src/layouts/nav-config-dashboard.tsx` (Tesorería › Conciliación ›
  Conciliación Bancaria); se importa con el proceso habitual de opciones, sin script.
- Dependencia nueva: `jszip`.
- Listados paginados (`getConciliaciones`, `getMovimientosBanco`, `getMovimientosErp`) usan el motor
  genérico (rows/columns/pagination) para alimentar `DataTableQuery`.

## 5. Despliegue (en este orden)

1. `npm install --legacy-peer-deps` (nueva dependencia `jszip`).
2. Ejecutar `conciliacion_bancaria_migration.sql` en `sigafi_dbo`.
3. Importar el menú con el proceso habitual (`f_generar_opciones_proerp`) y dar permiso a los perfiles.
4. **Poner el número de cuenta en `nombre_tecba` de cada cuenta bancaria** (Catálogos › Cuentas
   Bancarias): sin eso la cuenta no se detecta sola (igual se puede elegir a mano en el diálogo).
5. Reiniciar el backend y desplegar el frontend. Con el frontend nuevo y el backend viejo las
   pantallas muestran "No se pudo cargar" con Reintentar (no se caen).

Se conciliará dentro de la **sucursal activa** (`ide_sucu` = empresa legal): la cuenta de Deuna es de
la persona natural, así que probablemente hay que estar en esa sucursal. Si el archivo pertenece a una
cuenta de otra sucursal el diálogo lo avisa.

## 6. Qué se probó y qué no

Probado:
- Los 5 archivos reales (Deuna ago y sep, Pichincha, Produbanco, Guayaquil): formato, cuenta, periodo,
  movimientos y saldos (la cadena cuadra en todos; ver hallazgo de Deuna).
- Migración + servicios contra **PostgreSQL 18 embebido** (no la BD real): carga, dedupe de cortes,
  cruce automático, manual, con diferencia, deshacer, marcar, IA con GPT simulado y su validación,
  cierre/reapertura/anulación, y las consultas paginadas con el `DataSourceService` real.
- `matching.spec.ts` (jest) y typecheck/lint de backend y frontend.
- Las páginas en el navegador con un backend **simulado**.

**No probado**: contra la BD real (`sigafi_dbo`) ni con datos reales del libro de bancos, con GPT real,
con login/permisos reales, ni las descargas de archivos en el servidor. Conviene una primera
conciliación real supervisada.

## 7. Pendiente / Fase 2

- [ ] **Registrar en el ERP lo que falta**: desde un movimiento *Falta en ERP*, crear el movimiento de
      libro de bancos (+ asiento) y conciliarlo en un paso (comisiones, intereses, cobros no registrados).
- [ ] **Reporte para la contadora**: partidas conciliatorias en PDF/Excel (cruces, faltantes, cheques
      en tránsito) por cuenta y mes.
- [ ] Alertar si el **saldo inicial** de un mes no coincide con el saldo final de la conciliación del
      mes anterior.
- [ ] Permisos: quién puede cerrar/anular (hoy cualquiera con acceso a la página).
- [ ] Parser genérico con GPT para bancos/formatos nuevos; soporte `.xls` antiguo y varias hojas.
- [ ] Cuentas de tarjeta/procesador (Bendo) y cajas: hoy las cajas se excluyen; las de tarjeta se
      pueden conciliar si hay estado de cuenta.
- [ ] Guardar también el archivo en el gestor de archivos del ERP (`sis_archivo`) además de la carpeta
      de conciliaciones.
- [ ] Evaluar retirar las tablas legadas `tes_conciliacion_banco` y `tes_configura_conciliacion`
      (sin uso en el código).

## 8. Preguntas abiertas

1. ¿Qué perfiles deben poder **cerrar** una conciliación (¿solo contabilidad?)?
2. Los movimientos que el banco genera solo (comisiones, IVA de comisión, intereses): ¿se registran
   siempre con el mismo tipo de transacción y contrapartida? Define la Fase 2 de "registrar faltantes".
3. ¿La cuenta Deuna queda en la sucursal 1 (persona natural)? Confirmar para el menú y los permisos.
