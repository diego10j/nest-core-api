# DataTableQuery + `core/getTableQuery`: revisión y plan de optimización

Alcance: `react-front-erp/src/core/components/dataTable/*`, `src/api/core.ts` (`useMemoizedSWR`) y, en este repo, `CoreService.getTableQuery` → `DataSourceService.createQuery`.
Fase de análisis: no se ha cambiado código. Cada punto indica impacto y riesgo para el flujo actual.

## 1. Lo que ya está bien (no tocar)
- Front: `memo(DataTableQuery)`, filas virtualizadas (`@tanstack/react-virtual`), `useMemo`/`useCallback` extensivos, referencias estables (`EMPTY_ARRAY`, `EMPTY_SELECTED_VALUES`), SWR con `keepPreviousData`, `dedupingInterval`, `updateParams` con debounce de 300 ms, `schema:false` tras la primera carga, filtro por columna paginado (`distinctColumn`).
- Back: paginación/filtros parametrizados con lista blanca de operadores e identificadores, total filtrado fusionado con `COUNT(1) OVER()`, esquema cacheado en Redis.

## 2. Hallazgos del backend (orden por impacto)
| # | Hallazgo | Impacto | Riesgo |
|---|---|---|---|
| B1 | `calculateTotalRecordsWithoutFilters` ejecuta un `COUNT(1)` sobre toda la consulta **en cada página y cada orden**, aunque el total no cambie. Es una query extra y secuencial antes de la de datos. | Alto en tablas grandes (facturas, kardex, libro mayor) | Bajo |
| B2 | Las dos queries (total y datos) corren en serie (`await` uno tras otro). | Medio | Bajo |
| B3 | Sin compresión HTTP (`compression`): respuestas JSON de hasta 500 filas × muchas columnas viajan sin gzip. | Medio-alto (red/móvil) | Bajo |
| B4 | `getSchemaQuery` hace `redis.get` + `JSON.parse` en cada request con `schema:true` y la respuesta incluye `columns` aunque el cliente ya las tenga. | Bajo-medio | Bajo |
| B5 | `setPaginationMetadata`: `isPreviousPage = pageIndex > 1` y `isNextPage = pageIndex < totalPages` parecen desfasados si `pageIndex` es base 0 (previa debería ser `> 0`, siguiente `< totalPages - 1`). | UX (botones prev/next) | Bajo; confirmar con el front cuál usa |
| B6 | `getTableQuery` interpola `columns`, `condition`, `orderBy` y `primaryKey` sin validar (ya anotado para la fase de endpoints genéricos `core/*`). | Seguridad | Se trata en la fase aparte |
| B7 | Sin `statement_timeout`: una consulta pesada o un `ILIKE '%x%'` global sobre muchas columnas puede ocupar una conexión del pool (max 20). | Medio | Bajo |
| B8 | Búsqueda global/filtros `ILIKE '%x%'` sobre `::text` no usan índices. | Alto en tablas grandes | Medio (requiere `pg_trgm` + índices GIN por tabla caliente) |

## 3. Hallazgos del front
| # | Hallazgo | Impacto |
|---|---|---|
| F1 | `useDataTableQuery` copia `dataResponse.rows` a estado local (`setData`) dentro de un `useEffect`: cada respuesta provoca un render extra con la tabla aún con datos viejos. Se puede derivar con `useMemo` desde `dataResponse` y evitar el segundo render. | Medio |
| F2 | Muchos `useState` que se fijan en el mismo efecto (`totalRecords`, `totalFilterRecords`, `paginationResponse`, `lazy`, `pagination`…): derivables de `dataResponse` sin estado (menos renders y sin riesgo de desincronización). | Medio |
| F3 | `initialParamsKey = JSON.stringify(initialParams)` en cada render de `useMemoizedSWR` (coste proporcional al tamaño de params; con `condition` largos o listas en `IN`). Reemplazar por comparación estructural estable (`useDeepCompareMemo` o `swr` `serialize`). | Bajo-medio |
| F4 | `isLoading = isLoadingSWR \|\| isValidating`: cualquier revalidación (incluida la de reconexión) re‑renderiza todo y muestra la barra de progreso. Separar `isFetching` (barra fina) de `isLoading` (skeleton). | Medio (UX) |
| F5 | El refetch al escribir en el buscador/filtros depende del debounce de 300 ms: confirmar que el `input` del buscador es estado local de la toolbar y solo sube el valor tras el debounce (que escribir no re-renderiza la tabla). | Medio |
| F6 | `onFocus` revalidación desactivada por defecto: bien; falta **precarga de la página siguiente** (`preload`/`mutate` silencioso) para paginación instantánea. | UX |
| F7 | Componentes grandes (`DataTableQuery` 1075 líneas, `useDataTable` 1204, `useDataTableQuery` 795, `ConfigDataTable` 555): costoso de mantener y de razonar sobre renders. Dividir por responsabilidad (toolbar, cuerpo, paginación, selección). | Mantenibilidad |
| F8 | `useDataTable.ts` (versión no‑query) duplica mucha lógica de `useDataTableQuery`. Extraer hooks comunes (selección, columnas visibles, personalización). | Mantenibilidad |
| F9 | Medir antes de tocar: `React Profiler` + `why-did-you-render` en dev sobre 3 pantallas (Facturas, Libro mayor, Clientes), y registrar nº de renders por interacción (paginar, ordenar, filtrar, seleccionar fila, abrir/cerrar diálogo). | Base de medición |

## 4. UX
- Distinguir carga inicial (skeleton) de refetch (barra superior + tabla atenuada, sin saltos de layout).
- Conservar scroll, selección y foco al paginar/refrescar (la selección ya usa PK, ver comentarios en el hook).
- Mostrar "N de M" claro con filtros activos y chips de filtro ya existentes con botón "Limpiar todo".
- Estado vacío vs. error vs. sin permisos diferenciados; botón "Reintentar" en error de red.
- Persistir por pantalla: tamaño de página, orden, columnas visibles (ya hay personalización en `sis_campo`; añadir preferencias de usuario en `localStorage` con try/catch).
- Accesibilidad: roles `grid`, `aria-sort`, `aria-rowcount` con la virtualización, navegación por teclado entre filas.
- Exportar respetando filtros y sin cargar todo en memoria (o export server-side para tablas grandes).

## 5. Plan por fases (cada fase sin cambiar contrato de la API)
**Fase 0 — Medición (1 día)**: perfilar 3 pantallas y registrar tiempos del endpoint (`EXPLAIN (ANALYZE, BUFFERS)` de la query de datos y del COUNT) y tamaño de respuesta. Sin esto no se prioriza.

**Fase 1 — Backend rápido y seguro (bajo riesgo)**
1. B3: `compression` en `main.ts` (umbral 1 KB).
2. B1+B2: cachear el total sin filtros (Redis, TTL 30–60 s, clave = hash de SQL+params+empresa) **o** ejecutarlo en paralelo (`Promise.all`) con la query de datos; omitirlo cuando `pageIndex > 0` y el cliente reenvía `totalRecords` conocido.
3. B7: `statement_timeout` (p. ej. 30 s) por conexión del pool + `query_timeout`.
4. B4: no devolver `columns` cuando `schema:false` (ya así) y evitar `JSON.parse` repetido con un caché en memoria de proceso (LRU corto) delante de Redis.
5. B5: corregir metadatos de paginación **solo después de confirmar** qué campo usa el front.
Pruebas: e2e de `getTableQuery` (paginación, filtros, orden, `lastPage`) antes y después.

**Fase 2 — Front: renders (riesgo medio, con medición)**
1. F1/F2: derivar `data`, `totalRecords`, `paginationResponse`, `lazy` desde `dataResponse` con `useMemo`; mantener estado solo para lo editable.
2. F3: serialización estable de params.
3. F4: separar `isFetching` de `isLoading`.
4. F5: verificar buscador con estado local + debounce.
5. Repetir el perfilado de Fase 0 y comparar.

**Fase 3 — UX (bajo riesgo)**: puntos de la sección 4, empezando por estados de carga/error y persistencia de preferencias; precarga de página siguiente (F6).

**Fase 4 — Índices y búsqueda (según Fase 0)**: `pg_trgm` + GIN para columnas de búsqueda global de las tablas más grandes; revisar que el `ORDER BY` por defecto use índice; vistas materializadas para reportes pesados.

**Fase 5 — Estructura**: dividir los archivos grandes (F7/F8) con la medición como red de seguridad; añadir tests de componente (React Testing Library) para selección, paginación y filtros.

## 6. Reglas para no romper el ERP
- No cambiar nombres ni forma de la respuesta de `core/getTableQuery*`.
- Cada fase en su rama, build del front (`yarn build`) y e2e del back en verde antes de fusionar.
- Fases 1 y 2 detrás de pruebas comparativas con las mismas consultas reales (misma data, mismas páginas).
- Seguridad de `core/*` (B6) queda en su fase aparte ya acordada.

## 7. Resultado de la validación en navegador y acciones (front, rama `claude/front-rendimiento-bundle`)
Hallazgos de la revisión con agente sobre el build real, y qué se hizo:

| Hallazgo | Acción |
|---|---|
| Entry de 3,9 MB / 1,2 MB gzip en todas las páginas | Causa real (por análisis estático + visualizer): `layouts/dashboard/layout.tsx` importaba `QuimiaChat` (→ BlockNote, ProseMirror, lightbox, markdown) y `ChangePasswordDialog` (→ `hook-form` → TipTap + lowlight/highlight.js). Ahora ambos son `lazy`, y `RHFEditor` carga el editor bajo demanda. Entry: **~2,2 MB / ~690 KB gzip** (−43 % gzip). |
| `xlsx` estático en `exportDataTable.tsx` | `import('xlsx')` dentro de las funciones de exportar; igual en `leerLiquidacion` (tesorería). Exportar sigue igual (ahora asíncrono, con try/catch). |
| `No HydrateFallback element provided` | `HydrateFallback: () => null` en la ruta raíz (no cambia lo que se ve). |
| Rutas del dashboard con `lazy:` | Correcto; los chunks compartidos venían de los imports estáticos del layout, no de las rutas. |
| `getProformas` 1,8 s | Sin cambios aún: la consulta ya usa CTEs filtradas por período. Lo más probable es el patrón de paginación lazy (la consulta completa se ejecuta dos veces: COUNT + datos; punto B1/B2 de la sección 2) y un índice en `cxc_cabece_factura(num_proforma_cccfa)`. Falta `EXPLAIN (ANALYZE, BUFFERS)` real (Fase 0). |
| Reconexiones del socket de WhatsApp (`31.220.100.73:3003`) | Sin cambios: depende del servidor externo del bot (ping timeout); revisar allí. |

Siguiente tramo del entry (por tamaño sin minificar): `@mui/x-date-pickers` (~500 KB, por `LocalizationProvider` en `app.tsx` y páginas), `motion-dom`/`framer-motion` (~400 KB, `components/animate`), `src/components/iconify` (~190 KB de iconos offline), `src/assets/illustrations` (~140 KB), `zod` y `react-hook-form`. Ver `ANALYZE=true yarn build`.

## 8. Avance – Fase 1 backend (HECHA en la rama `claude/gracious-rubin-5kxiwm`)

Prueba de regresión nueva: `test/datatable-query.integration-spec.ts` (13 casos contra una BD real: paginación, última página, `lastPage`, orden, filtros, búsqueda global, página fuera de rango, no lazy, parámetros de negocio + filtros). Se omite sin `TEST_DB_URL`.
Ejecutar: `TEST_DB_URL=postgres://usuario:clave@host:5432/base yarn test:integration` (crea la tabla de ejemplo indicada en el encabezado del archivo; apuntar a una BD de pruebas, no a producción).
Antes de cambiar nada, 10 de 13 pasaban y 3 fallaban por el bug B5 (confirmado).

| Punto | Estado | Detalle / medición |
|---|---|---|
| B2 COUNT en paralelo | Hecho | El COUNT sin filtros ya no espera a la query de datos (salvo `lastPage`, que lo necesita para calcular la página). En una tabla sintética de 1,5 M de filas, 4 núcleos, BD local: media por petición ~190 ms → ~160–190 ms (−15 % a −30 %, según orden; con `ORDER BY` sin índice domina la query de datos y la ganancia es menor). **La ganancia real depende del coste del COUNT frente al de la query de datos: medir con `EXPLAIN (ANALYZE)` de las pantallas reales (Fase 0).** Usa 2 conexiones del pool a la vez por petición lazy (pool = 20). |
| B3 compresión | Hecho | `compression` (umbral 1 KB) en `main.ts`: un JSON de 400 filas pasa de 17,3 KB a 3,1 KB (−82 %). Si hay nginx delante con gzip, no se recomprime (ya viene con `Content-Encoding`). |
| B5 metadatos de paginación | Hecho | `hasPreviousPage = pageIndex > 0`, `hasNextPage = pageIndex + 1 < totalPages`. El front actual no usa estos campos, así que no cambia nada visible. |
| B7 `statement_timeout` | Opcional | Variable `DB_STATEMENT_TIMEOUT_MS` (0 = desactivado, comportamiento actual). No se activa por defecto porque también cortaría reportes e importaciones largas. |
| B1 caché del total sin filtros | **No hecho (decisión)** | Mostraría un total desactualizado hasta el TTL tras altas/bajas. Se reevalúa con la medición real de la Fase 0. |
| B4 caché de esquema en memoria | Pendiente | Beneficio bajo; solo `schema:true` (primera carga). |
| B8 índices `pg_trgm` | Pendiente | Requiere medir en las tablas reales (Fase 4). |

Siguiente: Fase 2 (front, renders: F1–F5).

## 9. Avance – Fase 2 front (rama `claude/front-dtq-renders`) y arnés de medición

**Arnés de medición (nuevo, sin tocar el código de la app):** `scripts/perf/dtq-mock-server.js` (backend simulado con datos reales de la tabla de pruebas `dtq_item`) y `scripts/perf/dtq-medir-front.js` (Playwright: inicia sesión con un token falso, abre `/dashboard/ventas/facturacion/list`, pulsa "siguiente" 5 veces y mide ms hasta ver las filas nuevas y commits de React vía `__REACT_DEVTOOLS_GLOBAL_HOOK__`).
Cómo repetirlo: crear `.env.local` en el front con `VITE_SERVER_URL=http://127.0.0.1:3999` (+ `VITE_FORMAT_*`), `node scripts/perf/dtq-mock-server.js`, `yarn build && yarn preview --port 18081` y `PORT=18081 node scripts/perf/dtq-medir-front.js`.
Importante: medir contra el **build de producción** (`yarn preview`); en `yarn dev` React corre en modo desarrollo y los tiempos no son representativos.

**Qué se cambió (front, 3 archivos):**
| Punto | Cambio |
|---|---|
| F1/F2 | `data`, `totalRecords`, `totalFilterRecords`, `paginationResponse` y `lazy` se derivan de `dataResponse` en el mismo render (antes: 5 `useState` copiados en un efecto → un render extra de toda la tabla por respuesta). Se conserva la semántica anterior: una respuesta sin `rows` no borra lo mostrado, y las filas no se exponen hasta que el primer efecto cargó `columns`/`primaryKey` (filas y columnas aparecen juntas). |
| Espera al paginar/ordenar | `updateParams` acepta un número de ms; paginar y ordenar usan 60 ms en vez de los 300 ms del debounce general (que se sentían como lentitud). Filtros y búsqueda conservan su comportamiento. |
| F3, F4, F5 | **No se tocaron**: la medición mostró que no son el cuello de botella (una sola petición por interacción, 0 renders en reposo) y F4 cambia la UI de carga. |

**Resultados (build de producción, 2 rondas, red local de ~10 ms):**
| Métrica | Antes | Después |
|---|---|---|
| Clic en "siguiente" → filas nuevas visibles | ~500 ms | ~245 ms (**−50 %**) |
| Commits de React por cambio de página (dev) | 10–14 | 9–12 (−1) |
| Peticiones por interacción | 1 | 1 |
| Commits en reposo (3 s sin interacción) | 0 | 0 |
En el servidor real habrá además la latencia de red y de la consulta: el ahorro fijo de ~255 ms por interacción se mantiene.

**Pendiente de esta fase:** repetir la medición en las pantallas reales (Libro mayor, Clientes) contra el backend real y comparar `EXPLAIN (ANALYZE, BUFFERS)` (Fase 0); medir el ordenar (el arnés solo cubre paginar); decidir F4 (separar `isFetching` de `isLoading`) si se quiere atenuar la tabla durante el refetch.
**Riesgo conocido y a probar a mano:** clics muy rápidos en "siguiente" lanzan una petición por clic separado más de 60 ms (antes se fusionaban en una); SWR descarta las respuestas viejas, solo hay más tráfico.
