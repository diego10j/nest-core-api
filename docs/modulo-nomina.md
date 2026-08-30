# Módulo de Nómina / Talento Humano

Estado: **funcional end-to-end para DIQUIMEC S.A.S.** (empresa privada, Código de
Trabajo — no LOSEP). Verificado el 2026-08-30 navegando la app real contra el backend
real (`31.220.100.73:3000`): crear empleado → asociar puesto/salario → generar rol →
cerrar rol (asiento contable + provisión de décimos/fondos + cuenta por pagar), todo con
valores correctos y cuadrados.

Este documento cubre cómo funciona, qué se construyó, cómo se configura desde cero, y
qué falta. Complementa (no reemplaza) el plan original de diseño — ver
`erp-knowledge` (vault externo) y los comentarios inline de cada archivo, que son la
fuente de verdad más granular.

## 1. Alcance

DIQUIMEC no tiene los conceptos de sector público que trae el esquema `gen_`/`gth_`
heredado (partida presupuestaria, grupo de cargo, LOSEP). El módulo reutiliza esas
tablas igual (evita bifurcar el esquema) pero les inyecta un combo "genérico" fijo
donde ese detalle no aplica — ver sección 6.

Un solo tipo de rol real: **"Normal"** (mensual, Código de Trabajo). "Nómina Pago
Décimos" existe como tipo de nómina independiente porque el usuario pidió explícitamente
que los décimos, cuando se liquidan anualmente, generen su propio rol separado del
mensual (ver sección 4, Liquidación Anual).

## 2. Modelo de datos

### 2.1 Tablas nuevas creadas para este módulo (`01-script-nomina-talento-humano.sql`)

| Tabla | Para qué |
|---|---|
| `nrh_detalle_rol` | Línea calculada y **congelada** por empleado+rubro dentro de un rol ya generado. El corazón del módulo — sin esto no hay forma de imprimir un rol viejo sin recalcularlo, ni de armar el asiento contable. |
| `nrh_hora_extra_candidata` | Horas fuera de jornada detectadas desde `asi_marcaciones`, pendientes de aprobación antes de entrar a un rol. Columnas `sugerencia_nrhec`/`tipo_nrhec`/`justificacion_nrhec`/`ide_nrrol` agregadas después vía `02-script-fix-horas-extra-candidata-columnas.sql` (bug encontrado en esta sesión, ver sección 8). |
| `nrh_solicitud_mensualizacion` | Por empleado+rubro (décimo 3°/décimo 4°/fondos de reserva): mensualiza (se paga cada mes en el rol normal) o acumula (se paga en la liquidación anual). Default legal si no hay solicitud: acumula. |
| `asi_vacacion`, `asi_detalle_vacacion`, `asi_permisos_vacacion_hext` | Vacaciones y permisos. Diseño tomado del proyecto hermano `sampudj` (mismo linaje de esquema). **Frontend con página propia, pero sin probar el flujo de creación real en esta sesión** — ver sección 9. |

### 2.2 Tablas reutilizadas tal cual (ya existían)

`gen_persona`, `gth_empleado` (+ `ide_geper` agregado por este módulo para asociarlo a
`gen_persona`), `gth_cargo`, `gen_empleados_departamento_par` (ancla real de todo
`nrh_*` vía `ide_geedp`), `nrh_rol`/`nrh_estado_rol`/`nrh_detalle_tipo_nomina`,
`nrh_rubro`/`nrh_tipo_rubro`/`nrh_forma_calculo`/`nrh_detalle_rubro` (motor de
fórmulas), `nrh_rubro_cuenta` (mapeo rubro→cuenta contable), `gen_departamento`,
`gen_partida_grupo_cargo`, `gen_grupo_cargo`, `gen_area`, `gen_departamento_sucursal`,
`gen_perido_rol`, `gen_periodo`, `gen_anio`, `gen_mes`.

## 3. Motor de fórmulas de rubros

Cada combinación (rubro × tipo de nómina) tiene una fila en `nrh_detalle_rubro` con una
`formula_nrder`. `FormulaEngineService` (`formula-engine.service.ts` +
`formula-parser.ts`) la evalúa:

- Sin fórmula (null/vacío) → 0. Se asume entrada manual (ej. horas extra), inyectada
  aparte por quien arma el rol.
- No empieza con `=` → valor literal fijo (constante, ej. SBU).
- Empieza con `=` → se parsea como expresión: referencias a otros rubros `[ide_nrder]`,
  acumulados históricos `sum[...]`, y el token `mensualizado` (boolean, resuelto por
  `RolPagosService#getMensualizacionVigente` antes de evaluar).

Mismo motor y sintaxis que usaba el sistema legado (`sigafi` Java) — se portó la lógica,
no el código.

### 3.1 Cálculos fijados por ley (código, no fórmula editable)

`CalculoLegalService` (`calculo-legal.service.ts`) — décimos, fondos de reserva y horas
extra NO se dejan como fórmula editable en `nrh_detalle_rubro`: son fijos por Código de
Trabajo/IESS, no hay variante legítima de negocio que un usuario deba poder tocar sin
pasar por code review.

```
valor_hora          = sueldo / 240                         (Art. 55 CT, divisor fijo)
horas suplementaria = valor_hora × 1.5 × horas              (recargo 50%)
horas extraordinaria= valor_hora × 2.0 × horas              (recargo 100%, feriado/descanso)
horas nocturna      = valor_hora × 1.25 × horas             (Art. 49 CT, 19:00-06:00)
fondos de reserva   = ingreso_gravable_mensual / 12          (8.33%, provisión mensual)
décimo tercero      = ingreso_gravable_mensual / 12          (provisión mensual)
décimo cuarto       = SBU_vigente / 12                       (provisión mensual, sin prorrateo)
IESS personal        = 9.45% del ingreso gravable            (nrh_detalle_rubro, fórmula)
IESS patronal         = 11.15% del ingreso gravable           (nrh_detalle_rubro, fórmula, informativo)
```

`ingreso_gravable_mensual = sueldo + horas suplementaria + horas extraordinaria + horas nocturna`
(no incluye "otros ingresos" — no modelado todavía).

**Importante**: décimos y fondos de reserva se calculan y se guardan en
`nrh_detalle_rol` en **todos** los roles, mensualice o no el empleado — es la provisión
contable del mes, el pasivo ya se debe aunque no se pague en efectivo todavía. Lo que
cambia según mensualización es si además entra al líquido a pagar de ese rol
(`crearCxpPorEmpleado`) o si solo queda acumulado para la liquidación anual.

## 4. Flujo completo de un rol de pagos

1. **Generar rol** (`generarRol`, Nómina > Roles de Pago > Nuevo Rol): elige tipo de
   nómina + período + fecha. Trae empleados vigentes a esa fecha
   (`gen_empleados_departamento_par.fecha_geedp` ≤ fecha ≤ `fecha_finctr_geedp` o null),
   evalúa la parametría de rubros de ese tipo de nómina para cada uno, inyecta sueldo/
   horas extra/décimos/fondos calculados por código, y congela todo en
   `nrh_detalle_rol`.
2. **Aprobar** (opcional, botón en el detalle) — el rol queda con estado "Aprobado",
   bloqueado para recálculo. En la práctica, `generarRol` ya deja el rol en estado
   aprobado directamente (ver hallazgo en sección 9 sobre el flujo de estados).
3. **Cerrar rol** (`cerrarRol`): arma un asiento contable consolidado
   (`con_cab_comp_cont`/`con_det_comp_cont`, vía `ComprobanteContabilidadService`)
   sumando por cuenta contable (`nrh_rubro_cuenta`, ver sección 6) todos los rubros del
   rol con signo (DEBE ingresos, HABER descuentos), más una línea HABER a "Sueldos por
   Pagar" (`p_nrh_cuenta_liquido_pagar`) por el líquido total. Crea además una CxP
   (`cxp_cabece_factur`) por cada empleado con el líquido a pagar (`TOTAL A RECIBIR` de
   su detalle), y dispara la provisión de décimos/fondos (paso 4).
4. **Provisión de décimos/fondos** (`generarProvisionDecimosFondos`, se dispara sola al
   cerrar el rol): un asiento aparte, HABER a la cuenta de pasivo de cada concepto
   (fondos de reserva / décimo 3° / décimo 4°) por el total de todos los empleados que
   **no** mensualizaron ese concepto, DEBE partido entre gasto de Ventas y gasto
   Administrativo según a qué departamento pertenece cada empleado
   (`gen_departamento.tipo_gasto_gedep`). Replica el asiento mensual
   "REGISTRO ROL DE PROVISIONES" que la contadora de DIQUIMEC ya hacía a mano.
5. **Liquidación Anual de Décimos** (`generarLiquidacionDecimo`, página separada
   "Liquidación de Décimos"): suma las provisiones mensuales acumuladas
   (`nrh_detalle_rol`) en la ventana legal del período (dic-nov para décimo 3°; ago-jul
   Sierra o mar-feb Costa para décimo 4°, según `p_nrh_region_decimo4`), excluyendo los
   meses en que el empleado ya mensualizó (ya se le pagó en el rol normal). Genera un
   `nrh_rol` nuevo (tipo "Nómina Pago Décimos"), su propio asiento — DEBE al pasivo
   (cancela la deuda acumulada) / HABER a "Sueldos por Pagar" — y una CxP por empleado.
   Al ser la SUMA de lo realmente provisionado mes a mes, un empleado que ingresó a
   mitad de período queda prorrateado automáticamente.

## 5. Horas extra (aprobación en dos pasos)

No es 100% manual ni 100% automático:
1. `detectarCandidatas` cruza `asi_marcaciones` contra el horario del empleado y crea
   filas `pendiente` en `nrh_hora_extra_candidata`, con un tipo sugerido automáticamente
   (`sugerirTipo`: domingo/feriado → extraordinaria, si no → suplementaria).
2. Un supervisor/RRHH aprueba o rechaza desde Nómina > Horas Extra, pudiendo cambiar el
   tipo final y agregar justificación (`aprobar`).
3. Solo las horas **aprobadas** entran a `generarRol` (`getHorasExtraAprobadas`).

**No probado en esta sesión** — requiere datos reales en `asi_marcaciones` para el
empleado de prueba, que no se cargaron (ver sección 9).

## 6. Catálogos y cómo configurarlos desde cero (empresa nueva)

Orden real de dependencias (no es el orden en que se descubrieron los gaps esta
sesión — ver `scripts/core/modules/nomina/` numerados 01-08 con este mismo orden):

1. **`01-script-nomina-talento-humano.sql`** — DDL: crea las tablas nuevas de la
   sección 2.1 y agrega `gth_empleado.ide_geper`.
2. **`02-script-fix-horas-extra-candidata-columnas.sql`** — agrega las 4 columnas de
   `nrh_hora_extra_candidata` que el código ya esperaba (complemento directo del script
   1, separado solo porque el gap se encontró después).
3. **`03-script-fix-sucursal-detalle-tipo-nomina.sql`** — corrige `ide_sucu` en
   `nrh_detalle_tipo_nomina` si viene de una plantilla con un ID de sucursal distinto al
   real de la empresa (confirmar el `ide_sucu` real contra `sis_sucursal` antes de
   correr — para DIQUIMEC en este sistema es `0`, no `1`).
4. **`04-script-depuracion-rol-diquimec.sql`** — si la BD viene de una plantilla
   multi-empresa con tipos de nómina de otras empresas, desactiva (nunca borra) lo que
   sobra y dejar solo "Normal" + "Nómina Pago Décimos" activos.
5. **`05-script-depuracion-variables-nomina.sql`** — depura `sis_parametros`
   (`ide_modu=6`), dejando solo los ~24 `p_nrh_*` que el código realmente lee (ver
   `src/core/variables/data/6-nrh-var.ts`).
6. **`06-script-provision-decimos-fondos-reserva.sql`** — siembra/corrige las 9
   variables de cuentas contables para la provisión de décimos/fondos (una por
   concepto × pasivo/gasto-venta/gasto-admin) contra el plan de cuentas real de la
   empresa.
7. **`07-script-seed-catalogos-puesto-salario.sql`** — siembra el combo "genérico"
   (`gen_partida_grupo_cargo`/`gen_grupo_cargo`/`gen_area`/`gen_departamento_sucursal`)
   y los departamentos reales Ventas/Administrativo, necesarios para poder asignar
   Puesto/Salario a un empleado.
8. **`08-script-seed-periodos-rol-2026.sql`** — siembra `gen_anio`/`gen_periodo`/
   `gen_perido_rol` (períodos mensuales) para los años que se vayan a usar — **no hay
   pantalla para crear períodos nuevos**, hay que correr este script (o uno análogo)
   cada vez que se necesite un año no sembrado. Ver deuda técnica, sección 10.

Después de correr los 8 scripts (idempotentes, se pueden re-correr sin romper nada):
- Nómina > Catálogos > Cargos: crear los cargos reales de la empresa.
- Nómina > Catálogos > Departamentos: no tiene botón "crear" (los siembra el script 7)
  — solo permite clasificar cada uno como Ventas/Administrativo.
- Nómina > Catálogos > Cuenta Contable de Rubros: mapear cada rubro que realmente se
  use (mínimo REMUNERACION UNIFICADA e IESS PERSONAL para que el asiento del rol
  cuadre — ver sección 6.1, es fácil dejar rubros con valor real sin mapear y que el
  asiento salga incompleto sin que nada avise).
- Nómina > Puestos y Salarios: asignar cargo+departamento+sueldo a cada empleado.
- Sistema > Variables > Nómina: revisar los ~24 `p_nrh_*` contra el plan de cuentas
  real antes del primer cierre de rol (ver `6-nrh-var.ts` para la lista completa con
  descripciones).

### 6.1 Sistema de cuentas contables — dos mecanismos distintos (hallazgo de diseño)

Encontrado investigando por qué "Cerrar Rol" excluía silenciosamente rubros del asiento:

- **`nrh_rubro_cuenta`** (tabla, pantalla "Cuenta Contable de Rubros"): mapeo simple
  `ide_nrrub → ide_cndpc` (1 cuenta por rubro). Lo usa `cerrarRol` para el asiento
  principal del rol (sueldo, IESS, etc.) vía `getTotalesPorCuenta`. **Solo exige que al
  menos un rubro tenga cuenta** (no todos, pese a que el texto del diálogo de
  confirmación dice "todos" — inconsistencia de copy, no corregida en esta sesión) —
  cualquier rubro sin cuenta mapeada queda **excluido silenciosamente** del asiento y
  del líquido de la CxP. Si no se mapea IESS PERSONAL, por ejemplo, la CxP sale por el
  sueldo bruto completo en vez del líquido real (se comprobó al probar el flujo: sin
  mapear IESS, el líquido salía en $460 en vez de $416.53).
- **`sis_parametros`** (variables sueltas, pantalla "Sistema > Variables"): la provisión
  de décimos/fondos de reserva y su liquidación anual necesitan **3 cuentas por
  concepto** (pasivo + gasto-venta + gasto-admin, porque el gasto se parte por
  departamento) — no cabían en el modelo 1-cuenta-por-rubro de `nrh_rubro_cuenta`, así
  que se resolvió con 9 variables nombradas a mano
  (`p_nrh_cuenta_pasivo_decimo_tercero`, `p_nrh_cuenta_gasto_venta_decimo_tercero`,
  `p_nrh_cuenta_gasto_admin_decimo_tercero`, y análogas para décimo_cuarto y
  fondos_reserva).

**Recomendación (no implementada, requiere decisión del usuario)**: extender
`nrh_rubro_cuenta` con columnas para pasivo/gasto-venta/gasto-admin (o una tabla
hermana `nrh_rubro_cuenta_provision` con `ide_nrrub, ide_cndpc_pasivo,
ide_cndpc_gasto_venta, ide_cndpc_gasto_admin`), configurable desde la misma pantalla de
catálogo en vez de "Sistema > Variables" genérico. Ventajas: se configura por UI de
negocio con contexto (no hay que saber el nombre exacto de la variable), es extensible
sin tocar código si mañana se agrega un cuarto concepto con provisión, y evita la clase
de bug de "nombre de variable escrito mal/valor 0 tratado como faltante" que sí
apareció esta sesión (sección 8). No se implementó porque es un cambio de esquema +
UI, fuera del alcance de una sesión de pruebas/bugfix — queda como mejora sugerida.

Para rubros que **no tienen** una cuenta contable real que les corresponda (la mayoría
de los rubros informativos: `IECE`, `SECAP`, `SUBTOTAL INGRESOS`, `BASE IMPONIBLE`,
etc. — nunca deben ir a un asiento), la recomendación es dejarlos simplemente **sin
mapear** en `nrh_rubro_cuenta` en vez de forzar una cuenta ficticia — el sistema ya los
excluye correctamente del asiento (es el comportamiento esperado, no un bug, para
rubros genuinamente informativos). Si en el futuro se agrega una columna de
observación al mapeo (para poder documentar "este rubro es solo informativo, no debe
llevar cuenta" sin dejar la fila ambigua entre "no configurado todavía" y
"deliberadamente sin cuenta"), sería parte del mismo refactor de la tabla mencionado
arriba.

## 7. Módulo Puestos y Salarios

`gen_empleados_departamento_par` tiene columnas NOT NULL heredadas del diseño de sector
público (`ide_gepgc`, `ide_gegro`, `ide_gecaf`, `ide_geare`, `ide_gttem`, `ide_gttco`,
`ide_gttsi`) que DIQUIMEC no necesita conceptualmente. El formulario de Puestos y
Salarios solo pide Cargo + Departamento + Sueldo + Fecha; el resto se completa en el
backend (`puestos-salarios.service.ts`) con el combo genérico sembrado por el script 7:

```
ide_gepgc=1, ide_gegro=1, ide_gecaf=1, ide_geare=1   (partida/grupo/cargo/área dummy)
ide_gttem=1  "CODIGO DE TRABAJO"                       (correcto para DIQUIMEC, privado)
ide_gttco=2  "CONTRATO INDEFINIDO"                      (default; no editable desde el form hoy)
ide_gttsi=1  "Ninguno"                                  (sindicato)
```

`ide_gedep` (Departamento, Ventas/Administrativo) sí es real y viene del formulario —
determina la provisión de décimos/fondos (sección 4, paso 4).

## 8. Bugs reales encontrados y corregidos (sesión de pruebas 2026-08-30)

Todos ya deployados en Debian y pusheados a GitHub (`main`), ver historial de commits
`c5c2eea..5c081aa` en `nest-core-api` y cambios sin commitear en `react-front-erp`
(ver nota al final sobre estado de commits del frontend).

1. **`empleados.dto.ts`/`empleados.service.ts`** — convertido al estándar camelCase
   explícito (sin `Record<string, any/unknown>`) que ya usa tesorería
   (`bancos-save.service.ts`).
2. **`puestos-salarios.service.ts`** — nunca llenaba las columnas NOT NULL de sector
   público (sección 7) — fallaba con "null value in column ide_gepgc". Se agregó el
   combo genérico + campo `ideGedep` real.
3. **`nrh_detalle_tipo_nomina.ide_sucu`** — las 9 filas (incluidas las 2 activas)
   tenían `ide_sucu=1`, huérfano (no existe en `sis_sucursal`) — dejaba vacío el combo
   "Tipo de Nómina" en Parametría y en Nuevo Rol, bloqueo total. Fix vía script 03.
4. **`gen_partida_grupo_cargo`/`gen_departamento`/`gen_departamento_sucursal`**
   completamente vacías — bloqueaba cualquier asignación de Puesto/Salario. Fix vía
   script 07.
5. **`gen_anio`/`gen_periodo`/`gen_perido_rol`** completamente vacías (salvo una fila
   legado `ide_geani=0 → "2017"`) — dejaba vacío el combo "Período" en Nuevo Rol,
   bloqueo total. Fix vía script 08.
6. **`nrh_hora_extra_candidata`** le faltaban 4 columnas que el código ya usaba
   (`sugerencia_nrhec`, `tipo_nrhec`, `justificacion_nrhec`, `ide_nrrol`) — 500 al abrir
   Nómina > Horas Extra. Fix vía script 02.
7. **`rol-pagos.service.ts#getRoles`** (columna `total_liquido` de la lista) y
   **`rol-pagos-details.tsx`** (header "Líquido" del detalle) sumaban **todos** los
   rubros del rol sin filtrar informativos — duplicaban valores ya contados en
   REMUNERACION UNIFICADA (ej. mostraba $2,389.08 en vez de $416.53). Corregido para
   usar el valor ya calculado del rubro `TOTAL A RECIBIR` en vez de re-sumar.
8. **`cerrarRol`/`generarLiquidacionDecimo`** validaban los parámetros de sistema con
   `if (!ideCntcm || ...)` — pero `ide_cntcm=0` ("DIARIO") es un valor real y legítimo,
   y `!0` es `true` en JS. El chequeo trataba una configuración correcta como
   "faltante" y bloqueaba el cierre de cualquier rol. Corregido a `== null`.
9. Warning de React (Select controlado→no controlado) en el formulario de empleado —
   varios lugares con `null` en vez de `''` como valor vacío de un `Field.Select`.
10. Bug de tipos (`persona.ide_geper: string | number` sin coercer a `number`) — solo
    lo detectó un `tsc --max-old-space-size=5000` con más memoria (el run normal hacía
    OOM antes de llegar a chequear este archivo en esta máquina — ver limitación de
    entorno más abajo).
11. Fecha sin formatear (ISO timestamp crudo) en la columna "Desde"/"Hasta" del
    historial de Puestos y Salarios — se agregó `fDate()`.

**Nota de entorno**: la máquina local donde corre el frontend en desarrollo tiene 7.6GB
de RAM compartidos entre varias sesiones de Claude Code simultáneas — `vite` y `tsc`
hacen OOM si se corren sin cuidado. Ver `feedback-wsl-memoria-limitada` en la memoria
del asistente para el detalle de mitigación (supervisor loop para vite,
`--max-old-space-size` para tsc standalone).

## 9. Estado de pruebas (qué se probó end-to-end vs qué falta)

**Probado end-to-end, funcionando correctamente**: Empleados (crear/editar/listar, con
validación Zod + servidor), Puestos y Salarios (crear asignación), Catálogo de Cargos
(crear), Catálogo de Cuenta Contable de Rubros (mapear), Generar Rol de Pagos, Cerrar
Rol (asiento contable + provisión décimos/fondos + CxP, con montos verificados contra
la BD real).

**Páginas que cargan limpias (sin errores de consola) pero sin probar el submit/CRUD
real de sus formularios**:
- Vacaciones (`vacaciones-permisos/vacaciones`) y Permisos (`.../permisos`) — no se
  creó ninguna vacación/permiso real.
- Catálogo de Feriados — no se creó ningún feriado.
- Catálogo de Rubros — se vio el catálogo ya poblado (legado), no se probó crear un
  rubro nuevo desde cero.
- Liquidación de Décimos (`rol-pagos/liquidacion-decimos`) — se visitó la página, no se
  ejecutó una liquidación real (requiere historial de meses provisionados, que con un
  solo rol de prueba no alcanza para una ventana legal completa).
- Ficha de empleado, tabs "Educación y Títulos" / "Experiencia Laboral" (dentro de
  Editar Empleado) — no se probó agregar un registro real.
- Horas Extra — se corrigió el bug 500 que impedía cargar la página (sección 8, #6),
  pero no se probó el flujo de detectar candidatas + aprobar una hora, porque no hay
  datos reales cargados en `asi_marcaciones` para el empleado de prueba.

**No verificado / no revisado en esta sesión**: reportes de nómina (el plan original
mencionaba un reporte mensual — no se encontró ninguna página de reportes en el módulo
actual, puede no estar implementada todavía), flujo de aprobación formal de horas
extra con datos reales de biométrico, anular un rol (`anularRol` — botón existe, no se
probó).

**Dato de prueba que quedó en el sistema real**: empleado "CARLOS JACOME" (`ide_gtemp=7`,
sobre la persona real "JACOME PONCE CARLOS RODRIGO") con datos demográficos ficticios,
puesto "Operario de Producción"/Administrativo/$460, y un rol de pagos #1 (Agosto 2026)
ya cerrado con su asiento contable y CxP reales. Decidir si se anula/limpia o se deja
como referencia.

## 10. Deuda técnica / mejoras sugeridas (no implementadas, requieren decisión)

1. Unificar cuentas contables de rubros en una sola tabla configurable en vez de
   tabla + 9 variables sueltas (sección 6.1).
2. Pantalla para gestionar Períodos de Rol (`gen_perido_rol`) — hoy solo se pueden
   crear corriendo SQL a mano (script 08), no hay UI. Cada año nuevo requiere repetir
   el seed.
3. Corregir el texto del diálogo de confirmación de "Cerrar Rol" — dice "requiere que
   todos los rubros tengan cuenta" pero el código solo exige al menos uno; el
   comportamiento real (rubros sin cuenta se excluyen silenciosamente del asiento) es
   fácil de malinterpretar y puede producir un asiento/CxP incompleto sin aviso.
4. El campo "Tipo de Contrato" (`ide_gttco`) queda fijo en "CONTRATO INDEFINIDO" en el
   backend de Puestos y Salarios — no es editable desde el formulario; agregar el
   campo si DIQUIMEC llega a necesitar otros tipos de contrato.

## 11. Páginas del frontend (`src/pages/talento-humano/`)

```
empleados/            empleados-list.tsx, empleado-create.tsx, empleado-edit.tsx
                       (tabs: Datos Generales, Educación y Títulos, Experiencia Laboral)
puestos-salarios/      puestos-salarios-list.tsx
rol-pagos/             rol-pagos-list.tsx, rol-pagos-create.tsx, rol-pagos-details.tsx,
                       liquidacion-decimos.tsx
horas-extra/           horas-extra-list.tsx (detección + aprobación)
vacaciones-permisos/   vacaciones-list.tsx, permisos (según paths.ts)
catalogos/             cargos, rubros, parametria (Parametría de Rubros), rubro-cuenta
                       (Cuenta Contable de Rubros), feriados, departamentos
```

Rutas completas en `src/routes/paths.ts` bajo `talentoHumano`.
