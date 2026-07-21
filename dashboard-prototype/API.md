# Contabilidad Data BI — API Reference

Base URL: `/api/contabilidad/data-bi`

---

## HEADERS (todos los endpoints)

| Header | Tipo | Requerido | Ejemplo |
|--------|------|:---:|---------|
| `X-Ide-Usua` | `number` | Si | `1` |
| `X-Ide-Empr` | `number` | Si | `1` |
| `X-Ide-Sucu` | `number` | Si | `1` |
| `X-Ide-Perf` | `number` | Si | `1` |
| `X-Login` | `string` | Si | `admin` |
| `X-Ip` | `string` | No | `192.168.0.10` |
| `X-Terminal` | `string` | No | `PC` |

---

## 1. getKpisPrincipales

KPIs financieros: totales de balance, resultados, comprobantes, debe/haber. Ideal para cards del dashboard.

```
GET /api/contabilidad/data-bi/getKpisPrincipales
```

**Query params:**
| Param | Tipo | Requerido | Ejemplo |
|-------|------|:---:|---------|
| `fechaInicio` | `string (ISO)` | Si | `2025-01-01` |
| `fechaFin` | `string (ISO)` | Si | `2025-12-31` |

**Response:** (objecto unico)
```json
{
  "total_activos": 406232.05,
  "total_pasivos": 158940.00,
  "total_patrimonio": 247292.05,
  "total_ingresos": 523800.00,
  "total_gastos": 198450.00,
  "total_costos": 114000.00,
  "utilidad_neta": 211350.00,
  "num_comprobantes": 502,
  "total_debe": 1047600.00,
  "total_haber": 1047600.00
}
```

---

## 2. getRatiosFinancieros

Ratios clave: endeudamiento, autonomia, margen neto, margen bruto, cobertura.

```
GET /api/contabilidad/data-bi/getRatiosFinancieros
```

**Query params:** igual que getKpisPrincipales (`fechaInicio`, `fechaFin`)

**Response:**
```json
{
  "total_activos": 406232.05,
  "total_pasivos": 158940.00,
  "total_patrimonio": 247292.05,
  "total_ingresos": 523800.00,
  "total_gastos": 198450.00,
  "total_costos": 114000.00,
  "utilidad_neta": 211350.00,
  "ratio_endeudamiento": 39.12,
  "ratio_autonomia": 60.88,
  "margen_neto": 40.35,
  "margen_bruto": 52.08,
  "cobertura_gastos": 1.6768
}
```

---

## 3. getEvolucionMensualResultados

Evolucion mensual de ingresos, costos, gastos y utilidad durante un año. Retorna 12 meses con ceros si no hay movimiento. **Ideal para grafico de lineas.**

```
GET /api/contabilidad/data-bi/getEvolucionMensualResultados
```

**Query params:**
| Param | Tipo | Requerido | Ejemplo |
|-------|------|:---:|---------|
| `anio` | `number` | Si | `2025` |

**Response:** `array[12]`
```json
[
  {
    "mes": 1,
    "nombre_gemes": "Enero",
    "total_ingresos": 38500.00,
    "total_gastos": 14500.00,
    "total_costos": 11700.00,
    "utilidad_neta": 12300.00
  },
  { "mes": 2, "nombre_gemes": "Febrero", "total_ingresos": 42100.00, ... },
  ...
]
```

---

## 4. getComposicionBalance

Distribucion porcentual Activo / Pasivo / Patrimonio. **Ideal para grafico de dona.**

```
GET /api/contabilidad/data-bi/getComposicionBalance
```

**Query params:** `fechaInicio`, `fechaFin`

**Response:** `array[3]`
```json
[
  { "ide_cntcu": 1, "nombre_cntcu": "ACTIVO",      "total": 406232.05, "porcentaje": 50.00 },
  { "ide_cntcu": 2, "nombre_cntcu": "PASIVO",      "total": 158940.00, "porcentaje": 19.56 },
  { "ide_cntcu": 3, "nombre_cntcu": "PATRIMONIO",  "total": 247292.05, "porcentaje": 30.44 }
]
```

---

## 5. getDistribucionGastos

Top N cuentas de gastos y costos (solo hojas `nivel_cndpc = 'HIJO'`). **Ideal para grafico de barras horizontales.**

```
GET /api/contabilidad/data-bi/getDistribucionGastos
```

**Query params:**
| Param | Tipo | Requerido | Default |
|-------|------|:---:|---------|
| `fechaInicio` | `string (ISO)` | Si | — |
| `fechaFin` | `string (ISO)` | Si | — |
| `limit` | `number` | No | `10` |

**Response:** `array[N]`
```json
[
  { "codigo": "5.2.01.01", "nombre": "Sueldos y Salarios", "tipo_cuenta": "GASTOS", "total": 48000.00, "porcentaje": 24.19 },
  { "codigo": "5.1.01.01", "nombre": "Servicios Básicos",  "tipo_cuenta": "GASTOS", "total": 32000.00, "porcentaje": 16.13 },
  ...
]
```

---

## 6. getVolumenMensualMovimientos

Volumen de actividad contable por mes (monto movilizado + comprobantes + promedio). **Ideal para combo chart (barra + linea).**

```
GET /api/contabilidad/data-bi/getVolumenMensualMovimientos
```

**Query params:** `anio` (number, requerido)

**Response:** `array[12]`
```json
[
  {
    "mes": 1,
    "nombre_gemes": "Enero",
    "volumen_total": 95000.00,
    "num_comprobantes": 42,
    "promedio_por_comprobante": 2261.90
  },
  ...
]
```

---

## 7. getTopCuentasMayorMovimiento

Cuentas con mayor numero de transacciones (debe/haber/saldo neto). **Ideal para tabla rankeada.**

```
GET /api/contabilidad/data-bi/getTopCuentasMayorMovimiento
```

**Query params:** `fechaInicio`, `fechaFin`, `limit` (default `10`)

**Response:** `array[N]`
```json
[
  {
    "codigo": "1.1.01.01",
    "nombre": "Caja General",
    "tipo_cuenta": "ACTIVO",
    "num_movimientos": 1248,
    "total_debe": 450000.00,
    "total_haber": 430000.00,
    "saldo_neto": 20000.00
  },
  ...
]
```

---

## 8. getComparativoPeriodos

Comparativo interanual mes a mes de ingresos y utilidad. **Ideal para grafico de barras agrupadas.**

```
GET /api/contabilidad/data-bi/getComparativoPeriodos
```

**Query params:**
| Param | Tipo | Requerido | Ejemplo |
|-------|------|:---:|---------|
| `anioActual` | `number` | Si | `2025` |
| `anioAnterior` | `number` | Si | `2024` |

**Response:** `array[12]`
```json
[
  {
    "mes": 1,
    "nombre_gemes": "Enero",
    "ingresos_actual": 38500.00,
    "utilidad_actual": 12300.00,
    "ingresos_anterior": 32000.00,
    "utilidad_anterior": 10200.00,
    "variacion_ingresos_pct": 20.31
  },
  ...
]
```

---

## 9. getTendenciaBalance

Evolucion mensual de Activos, Pasivos y Patrimonio. **Ideal para grafico de areas apiladas.**

```
GET /api/contabilidad/data-bi/getTendenciaBalance
```

**Query params:** `anio` (number, requerido)

**Response:** `array[12]`
```json
[
  {
    "mes": 1,
    "nombre_gemes": "Enero",
    "total_activos": 380000.00,
    "total_pasivos": 140000.00,
    "total_patrimonio": 240000.00,
    "activo_neto": 240000.00
  },
  ...
]
```

---

## 10. getDistribucionIngresos

Top N cuentas de ingresos (solo hojas). **Ideal para grafico de barras horizontales o pastel.**

```
GET /api/contabilidad/data-bi/getDistribucionIngresos
```

**Query params:** `fechaInicio`, `fechaFin`, `limit` (default `10`)

**Response:** `array[N]`
```json
[
  { "codigo": "4.1.01.01", "nombre": "Ventas 12%",           "total": 156000.00, "porcentaje": 29.78 },
  { "codigo": "4.1.02.01", "nombre": "Ventas 0%",            "total":  98000.00, "porcentaje": 18.71 },
  { "codigo": "4.2.01.01", "nombre": "Servicios Prestados",  "total":  72000.00, "porcentaje": 13.74 },
  ...
]
```

---

## 11. getActividadPorDiaSemana

Comprobantes y monto agrupado por dia de la semana (0=Domingo, 6=Sabado). **Ideal para grafico de barras con resalte de dias laborables.**

```
GET /api/contabilidad/data-bi/getActividadPorDiaSemana
```

**Query params:** `fechaInicio`, `fechaFin`

**Response:** `array[7]`
```json
[
  { "num_dia": 0, "dia_semana": "Domingo",   "num_comprobantes": 5,   "total_debe": 6500.00,   "promedio_por_comprobante": 1300.00 },
  { "num_dia": 1, "dia_semana": "Lunes",     "num_comprobantes": 85,  "total_debe": 195000.00, "promedio_por_comprobante": 2294.12 },
  { "num_dia": 2, "dia_semana": "Martes",    "num_comprobantes": 78,  "total_debe": 182000.00, "promedio_por_comprobante": 2333.33 },
  ...
]
```

---

## 12. getResumenPorTipoComprobante

Distribucion por tipo de comprobante (Diario, Ajuste, Cierre, etc.). **Ideal para grafico de dona.**

```
GET /api/contabilidad/data-bi/getResumenPorTipoComprobante
```

**Query params:** `fechaInicio`, `fechaFin`

**Response:** `array[N]`
```json
[
  { "nombre_cntcm": "Diario",    "num_comprobantes": 280, "total_debe": 650000.00, "porcentaje": 55.78 },
  { "nombre_cntcm": "Ajuste",    "num_comprobantes":  85, "total_debe": 210000.00, "porcentaje": 16.93 },
  { "nombre_cntcm": "Cierre",    "num_comprobantes":  45, "total_debe": 115000.00, "porcentaje":  8.96 },
  ...
]
```

---

## 13. getDashboardResumen  ★ NUEVO

KPIs + composicion + top 5 ingresos + top 5 gastos en **1 sola llamada**. Optimizado para cargar el dashboard principal sin multiples fetch.

```
GET /api/contabilidad/data-bi/getDashboardResumen
```

**Query params:** `fechaInicio`, `fechaFin`

**Response:**
```json
{
  "total_activos": 406232.05,
  "total_pasivos": 158940.00,
  "total_patrimonio": 247292.05,
  "total_ingresos": 523800.00,
  "total_gastos": 198450.00,
  "total_costos": 114000.00,
  "utilidad_neta": 211350.00,
  "num_comprobantes": 502,
  "total_debe": 1047600.00,
  "total_haber": 1047600.00,
  "ratio_endeudamiento": 39.12,
  "ratio_autonomia": 60.88,
  "margen_neto": 40.35,
  "composicion_balance": [
    { "ide_cntcu": 1, "nombre_cntcu": "ACTIVO",     "total": 406232.05, "porcentaje": 50.00 },
    { "ide_cntcu": 2, "nombre_cntcu": "PASIVO",     "total": 158940.00, "porcentaje": 19.56 },
    { "ide_cntcu": 3, "nombre_cntcu": "PATRIMONIO", "total": 247292.05, "porcentaje": 30.44 }
  ],
  "top_ingresos": [
    { "codigo": "4.1.01.01", "nombre": "Ventas 12%", "tipo": "INGRESO", "total": 156000.00 }
  ],
  "top_gastos": [
    { "codigo": "5.2.01.01", "nombre": "Sueldos y Salarios", "tipo": "GASTO", "total": 48000.00 }
  ]
}
```

---

## 14. getBalancePorPeriodo  ★ NUEVO

Balance general usando un periodo contable de `con_periodo` (usa sus fechas `fecha_inicio_cnper` / `fecha_fin_cnper`).

```
GET /api/contabilidad/data-bi/getBalancePorPeriodo
```

**Query params:**
| Param | Tipo | Requerido | Ejemplo |
|-------|------|:---:|---------|
| `ideCnper` | `number` | Si | `15` |

**Response:**
```json
{
  "nombre_cnper": "Enero 2025",
  "fecha_inicio_cnper": "2025-01-01",
  "fecha_fin_cnper": "2025-01-31",
  "detalle": [
    { "ide_cntcu": 1, "nombre_cntcu": "ACTIVO",     "total": 380000.00 },
    { "ide_cntcu": 2, "nombre_cntcu": "PASIVO",     "total": 140000.00 },
    { "ide_cntcu": 3, "nombre_cntcu": "PATRIMONIO", "total": 240000.00 }
  ]
}
```

---

## 15. getResultadosPorPeriodo  ★ NUEVO

Estado de resultados por periodo contable.

```
GET /api/contabilidad/data-bi/getResultadosPorPeriodo
```

**Query params:** `ideCnper` (number, requerido)

**Response:**
```json
{
  "nombre_cnper": "Enero 2025",
  "fecha_inicio_cnper": "2025-01-01",
  "fecha_fin_cnper": "2025-01-31",
  "detalle": [
    { "ide_cntcu": 4, "nombre_cntcu": "INGRESOS", "total": 78500.00 },
    { "ide_cntcu": 5, "nombre_cntcu": "GASTOS",   "total": 29000.00 },
    { "ide_cntcu": 6, "nombre_cntcu": "COSTOS",   "total": 23500.00 }
  ]
}
```

---

## 16. getEvolucionMargenBruto  ★ NUEVO

Margen bruto/neto en los ultimos N periodos contables (con %). **Ideal para combo chart con doble eje Y.**

```
GET /api/contabilidad/data-bi/getEvolucionMargenBruto
```

**Query params:**
| Param | Tipo | Requerido | Default |
|-------|------|:---:|---------|
| `cantidad` | `number` | No | `12` |

**Response:** `array[N]`
```json
[
  {
    "ide_cnper": 15,
    "nombre_cnper": "Enero 2025",
    "fecha_inicio_cnper": "2025-01-01",
    "fecha_fin_cnper": "2025-01-31",
    "total_ingresos": 78500.00,
    "total_costos": 23500.00,
    "total_gastos": 29000.00,
    "margen_bruto": 55000.00,
    "utilidad_neta": 26000.00,
    "pct_margen_bruto": 70.06,
    "pct_margen_neto": 33.12
  },
  ...
]
```

---

## 17. getConcentracionCuentas  ★ NUEVO

Analisis de Pareto: cuentas ordenadas por monto con % acumulado. **Ideal para grafico combinado barra + linea de Pareto.**

```
GET /api/contabilidad/data-bi/getConcentracionCuentas
```

**Query params:** `fechaInicio`, `fechaFin`, `limit` (default `20`)

**Response:** `array[N]`
```json
[
  {
    "codigo": "4.1.01.01",
    "nombre": "Ventas 12%",
    "tipo_cuenta": "INGRESOS",
    "total": 156000.00,
    "porcentaje": 17.42,
    "porcentaje_acumulado": 17.42
  },
  {
    "codigo": "1.1.01.01",
    "nombre": "Caja General",
    "tipo_cuenta": "ACTIVO",
    "total": 85000.00,
    "porcentaje": 9.50,
    "porcentaje_acumulado": 26.92
  },
  ...
]
```

---

## 18. getVariacionMensual  ★ NUEVO

Variacion porcentual mes a mes de ingresos, egresos y utilidad (con `LAG` window function). **Ideal para tabla con flechas de tendencia ↑↓.**

```
GET /api/contabilidad/data-bi/getVariacionMensual
```

**Query params:** `anio` (number, requerido)

**Response:** `array[12]`
```json
[
  {
    "mes": 1,
    "nombre_gemes": "Enero",
    "ingresos": 38500.00,
    "egresos": 26200.00,
    "utilidad": 12300.00,
    "variacion_ingresos_pct": null,
    "variacion_utilidad_pct": null
  },
  {
    "mes": 2,
    "nombre_gemes": "Febrero",
    "ingresos": 42100.00,
    "egresos": 27300.00,
    "utilidad": 14800.00,
    "variacion_ingresos_pct": 9.35,
    "variacion_utilidad_pct": 20.33
  },
  ...
]
```
> Enero siempre retorna `null` en variaciones por ser el primer mes.

---

## Resumen de DTOs

| DTO | Params | Usado por |
|-----|--------|-----------|
| `RangoFechasDto` | `fechaInicio`, `fechaFin` | 1, 2, 4, 5, 7, 10, 11, 12, 13, 17 |
| `PeriodoAnioDto` | `anio` | 3, 6, 9, 18 |
| `TopCuentasBiDto` | `fechaInicio`, `fechaFin`, `limit?` | 5, 7, 10, 17 |
| `ComparativoPeriodosDto` | `anioActual`, `anioAnterior` | 8 |
| `PeriodoContableDto` | `ideCnper` | 14, 15 |
| `EvolucionPeriodosDto` | `cantidad?` (default 12) | 16 |

---

## Flujo recomendado para el Dashboard

```
┌─ Carga inicial ───────────────────────────────────────┐
│                                                        │
│  1. GET getDashboardResumen (KPIs + composicion + top) │
│                                                        │
│  Luego en paralelo:                                    │
│  2. GET getEvolucionMensualResultados?anio=2025        │
│  3. GET getTendenciaBalance?anio=2025                  │
│  4. GET getVariacionMensual?anio=2025                  │
│  5. GET getVolumenMensualMovimientos?anio=2025         │
│  6. GET getComparativoPeriodos?anioActual=2025&...     │
│                                                        │
│  Bajo demanda (tabs secundarios):                      │
│  7. GET getDistribucionGastos                          │
│  8. GET getDistribucionIngresos                        │
│  9. GET getConcentracionCuentas (Pareto)               │
│ 10. GET getEvolucionMargenBruto                        │
│ 11. GET getTopCuentasMayorMovimiento                   │
│ 12. GET getActividadPorDiaSemana                       │
│ 13. GET getResumenPorTipoComprobante                   │
│                                                        │
│  Por periodo contable especifico:                      │
│ 14. GET getBalancePorPeriodo?ideCnper=15               │
│ 15. GET getResultadosPorPeriodo?ideCnper=15            │
│                                                        │
└────────────────────────────────────────────────────────┘
```
