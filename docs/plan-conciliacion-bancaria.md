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

## 9. Visor de archivos cargados (Excel / CSV / PDF, solo lectura)

Estado: **plan, sin implementar.**

### Objetivo
Desde la lista de *Archivos del banco cargados* (detalle de la conciliación), un botón **Ver** abre el
archivo original en un diálogo de solo lectura con navegación, sin descargarlo. Igual que el visor de PDF
que ya usa el ERP (`core/components/viewDialog/pdfView/PdfPreview.tsx`: diálogo al 90 % de alto, título,
nombre de archivo, menú de descarga / abrir en pestaña nueva).

### Qué hay hoy (revisado)
- **Backend**: no hay ningún componente/servicio de vista de Excel. `exceljs` estuvo en `package.json`
  pero se quitó en el commit `f326d92` ("dependencias actualizadas") y no está instalado; además no lee el
  Excel de Produbanco. Lo único para `.xlsx` es `jszip` + `parsers/lector-xlsx.ts` (mío, de esta feature).
- **Frontend**: no existe `ViewExcel`. Está `xlsx` (SheetJS 0.18.5) pero solo se usa para *exportar*
  (`exportDataTable.tsx`). Para PDF: `PdfPreview` + `useReportPrint` (blob URL en un `<iframe>`).
- Descarga del original: ya existe `GET tesoreria/conciliacion-bancaria/descargarArchivo/:ideTecar`.

### Decisión recomendada: el backend arma la vista, el front solo la pinta
Reutilizar `lector-xlsx.ts` (ya resuelve las rarezas de Produbanco: prefijo `x:`, rango mal declarado,
celdas sin coordenada) en vez de leer el Excel en el navegador con `xlsx`, que exigiría duplicar esos
arreglos. **Sin dependencias nuevas** en ninguno de los dos lados.

| Formato | Cómo se ve |
|---|---|
| `.xlsx` | Tabla tipo hoja de cálculo generada desde JSON (pestañas por hoja). |
| `.csv` | La misma tabla (una sola hoja, cabecera de la primera fila). |
| `.pdf` | Se reutiliza `PdfPreview` con la descarga como blob (visor nativo del navegador). |

### Backend
1. `lector-xlsx.ts`: nueva `leerHojasXlsx(buffer)` que devuelve **todas** las hojas con su nombre,
   conservando número de fila y columna real (hoy `leerPrimeraHojaXlsx` compacta filas y solo da la
   primera con datos). `leerPrimeraHojaXlsx` pasa a usarla, sin cambiar su comportamiento.
2. Endpoint `GET tesoreria/conciliacion-bancaria/getVistaArchivo?ideTecar=&hoja=&desde=&hasta=`:
   valida empresa (igual que `descargarArchivo`), lee el archivo guardado y devuelve
   `{ formato, hojas:[{nombre, filas, columnas}], hoja:{nombre, columnas:[A..], filas:[{n, celdas:[]}]}, truncado }`.
   Pagina por rango de filas (p. ej. 500) y limita el tamaño (los estados de cuenta son de cientos de
   filas, pero el tope evita cargas enormes). Números como número, fechas serial como texto legible.
3. Sin cambios de BD.

### Frontend (`react-front-erp`)
- Componente nuevo `core/components/viewDialog/excelView/ExcelPreview.tsx`, hermano de `PdfPreview`
  (mismo encabezado, menú de descarga, estado de carga y `LoadError` con Reintentar; `SectionBoundary`).
- Solo lectura y navegación:
  - Pestañas de hoja abajo, como Excel.
  - Encabezado de columnas A, B, C… y números de fila; fila y columnas inmovilizadas al desplazarse.
  - Buscador con resaltado y anterior/siguiente; ir a fila; copiar celda / fila.
  - Paginado o carga por tramos para hojas largas.
  - Alineación numérica a la derecha con formato de dinero; nada editable.
- Integración: en `archivos-conciliacion.tsx`, botón **Ver** (ícono de ojo) junto al de descargar; elige
  `ExcelPreview` (xlsx/csv) o `PdfPreview` (pdf) según la extensión.
- API: `getVistaArchivoConciliacion` en `api/modules/tesoreria/conciliacion-bancaria.ts` y una función
  para bajar el PDF como blob (ya hay una equivalente en `descargarArchivoConciliacion`).

### Extra opcional (fase posterior)
Resaltar en la vista las filas que corresponden a un movimiento ya conciliado / pendiente / faltante
(cruce por documento + monto), para que la contadora vea el archivo con el estado de cada línea.

### Pasos y esfuerzo
1. `leerHojasXlsx` + endpoint + prueba con los 3 archivos reales (Produbanco es el caso difícil). — chico
2. `ExcelPreview` + hook de carga por tramos. — mediano
3. Botón **Ver** en archivos + reuso de `PdfPreview` para Deuna. — chico
4. Verificación en navegador con backend simulado + typecheck/lint/jest. — chico

### Preguntas
1. ¿Basta con el visor dentro de la conciliación, o también lo quiere en el gestor de archivos general?
2. ¿Resaltado por estado de conciliación (extra) en esta entrega o después?
3. Para el CSV/Excel: ¿mostrar la fila de datos tal cual viene del banco (incluidas las líneas de
   encabezado como "Cuenta: …"), o solo la tabla de movimientos? Recomiendo tal cual, porque es lo que
   la contadora espera ver del original.

## 10. Comparador banco ↔ ERP (vista tipo "merge" con faltantes y alertas)

Estado: **plan, sin implementar.** Reemplaza la idea anterior de un "buscador" aparte: la búsqueda pasa a
ser una función del comparador.

### Objetivo
Una vista de **dos columnas alineadas** —a la izquierda el estado de cuenta del banco, a la derecha el
libro de bancos del ERP— como una herramienta de comparación de archivos (WinMerge / Beyond Compare):
- Lo que cruza aparece **en la misma línea**, unido.
- Lo que está de un lado y **falta en el otro** queda **en rojo** (banco sin ERP / ERP sin banco).
- Lo que cruzó pero **con algo raro** queda **en amarillo** (advertencia): diferencia de monto, fechas
  lejanas, mes distinto, cruce ambiguo, etc.
- **Buscar** en ambos lados, en solo uno, o filtrar solo lo rojo / solo las advertencias.

### Análisis: ¿es viable y útil?
- **Viable, sin cambios de BD.** Todo lo necesario ya existe: movimientos del banco
  (`tes_conciliacion_mov`), movimientos del ERP (`tes_cab_libr_banc`) y los cruces
  (`tes_conciliacion_match`, con tipo, regla, confianza, observación y `grupo`). El alineamiento sale de
  los propios cruces: cada grupo es una fila con lo del banco a la izquierda y lo del ERP a la derecha.
- **Muy útil**: es la forma natural de *revisar* una conciliación (hoy hay que mirar dos tablas
  separadas y sumar de cabeza). Hace visible en un vistazo qué falta y qué está dudoso, y sirve para
  enseñarle el resultado a la contadora. Complementa (no reemplaza) "Por conciliar", que sigue siendo la
  vista de trabajo para cruzar.
- **Esfuerzo: mediano.** Lo difícil es la interfaz (alineación, rendimiento, grupos N:M), no los datos.

### Cómo se alinean las filas
Orden por fecha (la más antigua del bloque). Tres tipos de bloque:
1. **Cruce** (1:1, 1:N, N:1, N:M): lado banco y lado ERP en la misma banda; si hay varios movimientos de un
   lado se apilan dentro de la banda.
2. **Solo banco** → izquierda con datos, derecha vacía en rojo: *"Falta en el ERP"*.
3. **Solo ERP** → derecha con datos, izquierda vacía en rojo: *"Falta en el banco"* (ej. cheque girado no
   cobrado, o movimiento del mes vecino).

### Reglas de color
| Color | Regla | Detalle |
|---|---|---|
| 🔴 Rojo | Banco sin ERP | Movimiento del banco sin cruce (incluye los marcados *Falta en ERP*). |
| 🔴 Rojo | ERP sin banco | Movimiento del ERP del mes sin cruce. |
| 🟡 Amarillo | Cruce con diferencia | La suma de un lado ≠ la del otro (se aceptó con justificación); se muestra el monto y la observación. |
| 🟡 Amarillo | Fechas distantes | Diferencia de fechas ≥ 1 día (se destaca si roza la tolerancia). |
| 🟡 Amarillo | Cruce entre meses | Uno de los lados cae fuera del mes de la conciliación. |
| 🟡 Amarillo | Cruce ambiguo / baja confianza | `MONTO_FECHA_AMBIGUO` (montos repetidos) o confianza < 70. |
| 🟡 Amarillo | Cruce por IA / suma | Aceptado a partir de una sugerencia: conviene revisarlo. |
| 🟡 Amarillo | Conciliado con el flujo antiguo | El libro tiene `conciliado_teclb` pero no tiene cruce en esta herramienta. |
| 🟡 Amarillo | Posible duplicado | Mismo monto y fecha repetidos en un lado sin correspondencia igual en el otro. |
| 🟡 Amarillo | Signo distinto | Ingreso contra egreso (detecta cruces manuales erróneos). |
| 🟡 Amarillo | Salto de saldo del banco | La cadena de saldos del archivo no encadena en ese movimiento (ej. el salto de $0,02 de Deuna). |
| ⚪ Gris | Ignorado | Marcado *Ignorado* por el contador. |

Las reglas se calculan **en el backend** (una sola fuente de verdad); el front solo pinta el color y el
motivo (tooltip/etiqueta). El color siempre va con ícono y texto (accesibilidad).

### Funciones
- **Filtros rápidos**: Todo · Solo diferencias (rojo + amarillo) · Faltan en ERP · Faltan en banco · Solo
  advertencias · Solo cruzados; con contador en cada chip.
- **Búsqueda**: campo con selector *Ambos / Solo banco / Solo ERP*; busca en documento, descripción,
  referencia, número, comprobante, beneficiario, observación y monto; resalta, con anterior/siguiente e
  "ir a fecha".
- **Diferencia acumulada por línea**: columna central con saldo del banco, saldo del ERP y su diferencia a
  esa fecha, para ver **desde qué movimiento se empieza a descuadrar** (lo que más ayuda a hallar el
  origen de una diferencia).
- **Acciones desde una fila**: conciliar estos dos (uno rojo de cada lado), deshacer cruce, marcar *Falta
  en ERP* / *Ignorar*, abrir el movimiento en el libro de bancos.
- **Candidatos en línea**: al elegir una fila roja del banco se muestran los movimientos rojos del ERP más
  probables (monto, fecha, parecido de nombre) para cruzarlos con un clic (reutiliza `matching.ts`).
- Solo lectura si la conciliación está cerrada.

### Backend
1. `GET tesoreria/conciliacion-bancaria/getComparacion?ideTecnc=`: arma los bloques alineados (cruces +
   solo-banco + solo-ERP), calcula las advertencias por bloque, el saldo de cada lado y la diferencia
   acumulada, y devuelve los contadores de cada filtro. Un mes cabe entero en memoria (cientos de filas);
   tope de seguridad por conciliación.
2. `getCandidatos` (movimiento del banco → ERP probables), reutilizando `matching.ts`.
3. Sin migración; los índices actuales bastan.

### Frontend
- Pestaña nueva **Comparar** en el detalle de la conciliación (junto a *Por conciliar*, *Movimientos del
  banco* y *Cruces*).
- Cabecera fija con los dos títulos, contadores y filtros; cuerpo con las bandas alineadas y una columna
  central con el estado (enlace, rojo, advertencia) y la diferencia acumulada.
- Al ir alineadas por banda, ambos lados comparten **un solo scroll** (no hace falta scroll sincronizado).
- Lista **virtualizada** o por tramos para más de ~500 movimientos.
- Mismas reglas del front: `LoadError`, `SectionBoundary`, datos validados con `objetoDe`.

### Riesgos / decisiones de diseño
- **Grupos N:M** (un depósito = varios cheques): banda con varios renglones por lado; la altura variable
  complica la virtualización → alturas por bloque.
- **Cruces entre meses**: el ERP candidato incluye el margen de la tolerancia; se etiquetan "otro mes" para
  no confundirlos con faltantes reales.
- **Cálculo de advertencias** en una sola pasada por orden de fecha; una conciliación = un mes, así que el
  volumen es acotado.
- El visor del archivo original (§9) sigue aparte: ahí se ve el archivo *tal cual*; aquí los movimientos
  *ya normalizados*.

### Pasos y esfuerzo
1. Backend `getComparacion` (bloques + reglas de advertencia + saldos acumulados) con pruebas en Postgres
   embebido y los archivos reales. — mediano
2. Componente de banda alineada + columna central + filtros y contadores (con datos simulados). — mediano
3. Búsqueda con alcance (ambos / banco / ERP) y resaltado. — chico
4. Acciones desde la fila (conciliar, deshacer, marcar) reutilizando los endpoints actuales. — chico
5. Candidatos en línea (`getCandidatos`). — chico/mediano
6. Verificación en navegador con backend simulado + typecheck, lint, jest. — chico

### Preguntas
1. ¿Solo para **revisar**, o también su vista principal de **trabajo** (cruzar desde aquí y dejar "Por
   conciliar" de respaldo)? Recomiendo empezar con revisar + acciones básicas.
2. ¿Los umbrales de advertencia (fechas ≥ 1 día, confianza < 70) le parecen bien?
3. ¿La exportación (Excel/PDF) de la comparación con colores entra en la primera entrega o en la Fase 2?
4. ¿Los movimientos **Ignorados** se muestran o se ocultan por defecto?
