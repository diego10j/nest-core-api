# TODO: `ide_sucu` como dos empresas legales (y futura sucursal real de DIQUIMEC)

Estado: **plan sin ejecutar**, para retomar en otra sesión. No se tocó código a partir de
este documento (salvo el fix puntual ya aplicado en `getDiferenciasContablesCxc`, ver
sección 0).

## 0. Contexto (por qué esto importa)

En esta BD, `ide_sucu` (`sis_sucursal`) no identifica una sucursal física de una misma
empresa — identifica **dos empresas legales independientes** que comparten la misma base
de datos:

- `ide_sucu = 0` → **DIQUIMEC** (persona jurídica, RUC nuevo, empresa activa).
- `ide_sucu = 1` → la empresa **anterior** (persona natural, RUC original) — prácticamente
  en liquidación, sin ventas ni compras nuevas.

Motivo histórico: al pasar de persona natural a persona jurídica se sacó un RUC nuevo. Para
no perder clientes/proveedores/datos maestros compartidos, la empresa nueva se modeló como
"sucursal" de la misma `ide_empr` en vez de migrar a una BD separada. `sis_empresa` tiene
**1 solo registro** (DIQUIMEC) — no se puede usar `ide_empr` para distinguir las dos
empresas.

**Novedad (agrega complejidad)**: a mediano plazo DIQUIMEC va a tener una sucursal **real**
(mismo RUC, sucursal física legítima). Es decir, `ide_sucu` va a necesitar representar
simultáneamente:
1. Una empresa distinta con RUC propio (`ide_sucu=1`, la anterior).
2. Una sucursal física dependiente de DIQUIMEC (mismo RUC que `ide_sucu=0`, futura).

Cualquier lógica que hoy asuma "un `ide_sucu` = una empresa" (incluido el fix ya aplicado)
se rompe el día que exista el caso 2.

### Pieza clave ya encontrada en el código: el RUC ya se resuelve por sucursal

`sis_sucursal.identicicacion_sucu` (RUC) ya se usa en el código como "la empresa" de una
sucursal — no hace falta columna nueva:

- `src/core/modules/sri/cel/emisor.service.ts` (`getEmisor`): el emisor SRI (RUC/ambiente
  de facturación electrónica) se configura por sucursal, no por empresa — ya pensado para
  "grupos económicos/franquicias" con RUCs distintos por local. Ver
  `erp-knowledge/_Glosario-Tablas/sri_emisor.md`.
- `src/core/modules/sri/ats/ats.service.ts:139` (`getEmpresa(ideSucu)`): devuelve
  `{identicicacion_sucu, nom_sucu}` desde `sis_sucursal` — literalmente ya llama "empresa"
  al RUC de una sucursal.
- El concepto de "establecimiento" SRI (código de 3 dígitos, `SUBSTR(serie_ccdaf, 1, 3)`)
  es MÁS FINO que `ide_sucu` y vive en la numeración de la factura, no en `sis_sucursal` -
  no confundir los dos niveles (empresa/RUC vs. establecimiento/local).

**Conclusión**: "empresa lógica" = `sis_sucursal.identicicacion_sucu` (RUC). Dos `ide_sucu`
con el mismo RUC son la misma empresa (deben sumarse/agregarse); RUC distinto = empresa
distinta (deben mantenerse separados). Cuando exista la sucursal real de DIQUIMEC, se le
asigna el mismo RUC que `ide_sucu=0` y cae sola en el grupo correcto — sin tocar queries
una por una, siempre que las queries usen el helper de la sección 2 en vez de comparar
`ide_sucu` literal.

## 1. Fase 0 — Verificar terreno (necesita acceso a la BD, no disponible en esta sesión)

- [ ] Confirmar que `identicicacion_sucu` es distinto entre `ide_sucu=0` y `ide_sucu=1` hoy,
      y que ninguna sucursal activa tiene RUC vacío/nulo/duplicado por error.
- [ ] Confirmar que `sis_empresa` (1 solo registro) no se usa en ningún módulo como si
      tuviera 2 filas (buscar `ide_empr` usado como discriminador de "empresa" en vez de
      `ide_sucu`/RUC).
- [ ] Confirmar en `con_det_plan_cuen`/`con_cab_conf_asie` si DIQUIMEC (ide_sucu=0) y la
      empresa anterior (ide_sucu=1) comparten plan de cuentas o tienen cuentas contables
      separadas para "Clientes"/"Proveedores" (`sis_parametros.p_con_cuenta_clientes_cxc`
      es un valor único por `ide_empr`, y ambas comparten `ide_empr` - hoy es forzosamente
      la misma cuenta para las dos).

## 2. Fase 1 — Helper reutilizable "empresa lógica"

- [ ] Crear un servicio/método compartido (candidato: `SucursalesService` o agregarlo a
      `VariablesService`/un nuevo `EmpresaScopeService`) con una firma tipo:
      `getSucursalesMismaEmpresa(ideSucu: number, ideEmpr: number): Promise<number[]>`
      — resuelve el RUC (`identicicacion_sucu`) de `ideSucu` y devuelve TODOS los
      `ide_sucu` que comparten ese RUC. Si el RUC viene null/vacío, hacer fallback a
      `[ideSucu]` (preserva el comportamiento actual, no rompe nada si el dato falta).
- [ ] Cachear el resultado (Redis, mismo patrón que `emisor.service.ts` cachea por
      `ide_sucu`) - se llama en casi todo reporte financiero, no debería pegarle a la BD
      cada vez.
- [ ] Considerar exponer también el inverso simple `getRucSucursal(ideSucu)` para no
      duplicar la query de `ats.service.ts::getEmpresa` (evaluar si conviene extraer esa
      función privada a este nuevo servicio compartido en vez de duplicarla).

## 3. Fase 2 — Refactorizar el fix ya aplicado a CxC para usar el helper

Ya se corrigió (sesión 2026-09-18) `clientes.service.ts`:
`getDiferenciasContablesCxc`, `getDiferenciasContablesCxcConsolidado`,
`getAsientosContablesCliente` — hoy filtran por `ide_sucu = dtoIn.ideSucu` literal
(correcto MIENTRAS haya una relación 1:1 entre `ide_sucu` y empresa).

- [ ] Cuando exista el helper de la Fase 1, cambiar esos 3 métodos para filtrar por
      `ide_sucu = ANY(sucursalesEmpresa)` en vez del valor literal — así siguen correctos
      el día que DIQUIMEC tenga una segunda sucursal real con el mismo RUC.
- [ ] Ojo: el criterio "cabecera, no detalle" (`ct.ide_sucu`, no `dt.ide_sucu`) sigue
      aplicando igual, solo cambia de comparar un valor a comparar contra el conjunto.

## 4. Fase 3 — CxP (mismo patrón, ya ubicado)

Encontrado en sesión previa (2026-09-18), mismo tipo de bug que CxC (agrega por
factura/proveedor pero filtra por `dt.ide_sucu` del detalle en vez de `ct.ide_sucu` de la
cabecera) — pendiente de corregir con el mismo criterio + el helper de empresa lógica:

- [ ] `cuentas-por-pagar.service.ts:124` — listado de cuentas por pagar
- [ ] `cuentas-por-pagar.service.ts:234` — `getCuentasPorPagarProveedorPendientes`
      (⚠️ se usa para **elegir qué facturas pagar** — la más grave de todas)
- [ ] `cuentas-por-pagar.service.ts:328` — dashboard/KPIs CxP
- [ ] `cuentas-por-pagar.service.ts:491` — dashboard por proveedor
- [ ] `cuentas-por-pagar.service.ts:766` — alertas de vencimiento
- [ ] `cuentas-por-pagar.service.ts:829` — `getTopCuentasPorPagar`
- [ ] `cuentas-por-pagar.service.ts:1059` — (sin revisar el detalle todavía)
- [ ] `documentos-cxp.service.ts:531` — `getSaldosProveedores` (análogo a
      `getSaldosClientes` de CxC)

## 5. Fase 4 — Contabilidad: config de cuentas por sucursal

- [ ] Revisar `asientos-automaticos.service.ts::getCuentaPersona`/`buscarCuentaPersona`
      (usa `con_cab_conf_asie`/`con_det_conf_asie`, filtra por `ide_empr` + `ide_sucu`
      exacto). Cuando exista la sucursal real de DIQUIMEC: ¿la config de cuentas se
      duplica manualmente para el nuevo `ide_sucu`, o debería resolver por "empresa
      lógica" (mismo RUC) igual que las queries de reconciliación? Definir esto ANTES de
      crear la sucursal nueva, no después.
- [ ] Documentar la decisión que se tome en `erp-knowledge/_Decisiones/`.

## 6. Fase 5 — Auditoría del resto, clasificando por dominio (no solo por tabla)

Criterio de clasificación a aplicar en cada archivo que use `ide_sucu`:

- **Debe agrupar por "empresa lógica" (RUC)**: CxC, CxP, contabilidad, reportes SRI/ATS,
  saldos consolidados — todo lo que legalmente pertenece a un RUC.
- **Debe seguir filtrando por `ide_sucu` literal (NO por RUC)**: inventario/stock por
  bodega, punto de venta, usuarios asignados a sucursal (`sis_usuario_sucursal`) — cosas
  operativas que quieren granularidad por local físico, incluso entre sucursales del mismo
  RUC (la futura sucursal de DIQUIMEC sí debería tener SU PROPIO stock/caja separado del
  de `ide_sucu=0`, aunque compartan RUC).
- **Datos maestros compartidos** (`gen_persona` - clientes/proveedores, catálogos): NO
  deben filtrarse por `ide_sucu` ni por RUC - esa es la razón de ser de todo este diseño.

Pendiente de auditar con este criterio: Inventario, Tesorería (ya hay una nota de que
`tes_cab_libr_banc.ide_sucu` es el de quien registra el movimiento, no necesariamente el de
la factura que paga), Nómina, y el resto de Contabilidad no cubierto en la Fase 4.

## Referencias

- `erp-knowledge/_Glosario-Tablas/sis_sucursal.md` — gotcha completo, FKs entrantes.
- `erp-knowledge/_Glosario-Tablas/sri_emisor.md` — RUC por sucursal, ya usado para
  grupos económicos.
- `erp-knowledge/_Decisiones/diferencias-cxc-ide-sucu-no-filtra.md` — historial del fix de
  CxC (incluye una versión anterior INCORRECTA del razonamiento, dejada a propósito como
  advertencia).
- Memoria del proyecto (`~/.claude/projects/.../memory/project_ide_sucu_dos_empresas.md`).
