# Informe QA (front accesibilidad + rendimiento) y revisión de seguridad del backend

Pruebas del front ejecutadas por el agente local sobre la rama `qa/accesibilidad-rendimiento` (fusión de `claude/front-rendimiento-bundle` + `claude/front-accesibilidad`) contra el backend remoto. Las correcciones posteriores están en `claude/front-accesibilidad` (commit `ae393a2`). Revisión de backend: análisis estático, sin ejecutar contra la base de datos.

## 1. Resultado de las pruebas del front
| Área | Resultado |
|---|---|
| Bundle inicial | `index-*.js` 692 KB gzip (antes ~1,2 MB) ✔ |
| HydrateFallback | sin aviso ✔ · consola sin errores ✔ |
| QuimIA, exportar a Excel (xlsx carga al hacer clic) | ✔ |
| Teclado: skip link, login, paginación, orden, foco visible, título de pestaña | ✔ |
| Sockets (sin sesión: 0; con sesión: 2; tras logout: 0) | ✔ |
| 403 en rutas sin permiso, sin 404/500 en ~15 módulos, sin `Failed to fetch dynamically imported module` | ✔ |
| Sin probar | editor en bot de WhatsApp (sin permiso del rol), subir liquidación de tarjeta (sin archivo) |

## 2. Problemas encontrados y qué se hizo
| # | Hallazgo | Causa | Estado |
|---|---|---|---|
| 1 | Fila "fuera de orden" tras ordenar y pasar de página | No era un fantasma: el scroll de la página 1 se conservaba y el virtualizador mostraba filas ~11+ de la página 2 (además las alturas medidas se cacheaban por posición) | **Corregido**: scroll al inicio al cambiar página/orden/filtros y clave por fila. Falta reprobar. |
| 2 | "Cambiar contraseña" no cierra con Esc | Preexistente, por diseño (`disableEscapeKeyDown` siempre) | **Corregido**: Esc cierra el cambio voluntario; el obligatorio sigue sin poder cerrarse |
| 3 | axe `aria-input-field-name`: selects de paginación | Sin nombre | **Corregido** (filas por página / ir a la página) |
| 4 | axe `nested-interactive` + `aria-command-name` + parte de `button-name` en dashboard | El buscador del header: contenedor `role="button"` con un `IconButton` dentro (en móvil) y sin nombre | **Corregido** (span interno + `aria-label`) |
| 5 | axe `button-name` crítico (1–2 nodos) | Botones con `{...props}` que el lint no ve: `MenuButton`, `NavToggleButton`, `RemoveButton`, `DeleteButton`, asas de arrastre | **Corregidos** estos 6. Si axe sigue marcando nodos, hace falta el HTML del nodo (`nodes[].html`) |
| 6 | axe `color-contrast` 12 nodos en listados | Paleta/estilos (preexistente) | Pendiente: hay que ver qué elementos (probablemente `text.disabled`, chips) |
| 7 | Login: `heading-order`, `page-has-heading-one` (moderadas) | Estructura de títulos | Pendiente (menor) |
| 8 | "Nueva Campaña" visible aunque el rol no tenga permiso (403 al clic) | UI no oculta por permiso | Pendiente (UX; el backend sí bloquea) |
| 9 | 77–85 peticiones por pantalla, ~20 a iconify | Los iconos se piden en línea a la API de Iconify en cada carga (y es una dependencia externa) | Pendiente, **recomendado**: registrar los iconos usados sin conexión (`addCollection`/build) o precargarlos |
| 10 | API: facturas 1062 ms, proformas 622 ms, clientes 560 ms, movimientos 457 ms | ~300–450 ms es latencia base al servidor remoto; el resto, consulta | Ver Fase 0 de `docs/datatablequery-plan-optimizacion.md` (COUNT repetido, EXPLAIN) |

Verificación de código eliminado: ninguna ruta rota, ningún módulo faltante (recorrido de Contabilidad, SRI, RR. HH., Importaciones, WhatsApp, Notificaciones, Etiquetas, POS, Base de Conocimiento, Tesorería).

## 3. Seguridad del backend: mejoras propuestas (por prioridad)
| # | Hallazgo | Riesgo | Propuesta |
|---|---|---|---|
| S1 (descartado) | `GET ventas/pos-punto-venta/getConfigPOS?ide_usua=` toma el usuario de la **query**, no del token | **Alto**: cualquier usuario autenticado puede pedir la configuración de impresora (incluido el token de la impresora, ahora servido desde backend) de otro usuario | Usar el `ideUsua` de los headers validados contra el JWT e ignorar el parámetro |
| S2 ✔ | `errors/getAllErrorLog` y `clearAllErrorLog` sin restricción | **Medio-alto**: cualquier usuario autenticado lee trazas/SQL de errores y puede borrar el registro | `@SuperUser()` |
| S3 ✔ | Dependencias: `liquidjs` (RCE crítico) está en `package.json` pero **no se importa en `src`**; `tar` crítico vía `bcrypt > node-pre-gyp` | Medio | Quitar `liquidjs`; actualizar `bcrypt` (o `resolutions` de `tar`). `yarn audit` total: 3 críticas, 387 altas (mayoría transitivas/dev) |
| S4 ✔ | `JWT_REFRESH_SECRET` por defecto `refresh_secret_change_me` | Alto si no se define en producción | Avisar/abortar al arrancar si usa el valor por defecto en producción |
| S5 | Webhook de YCloud: verificación con `===` sobre el token y sin validación de firma de los POST | Medio: cualquiera que conozca la URL puede inyectar eventos | Validar la firma HMAC del proveedor y comparar con `timingSafeEqual` |
| S6 | CORS: lista con `localhost`, IP de LAN y dominios de desarrollo en producción | Bajo-medio | Separar lista por entorno (`NODE_ENV`) |
| S7 | Swagger en `/docs` | Bajo-medio | Confirmar que no es público en producción (proteger o deshabilitar) |
| S8 | Endpoints genéricos `core/*` (inyección vía `condition`, escritura de tablas) | **Alto** | Ya acordado como fase aparte |
| S9 | Repo público | Alto | Pendiente: deploy key de solo lectura y luego hacerlo privado (`docs/repo-privado.md`) |
| S10 ✔ | Contraseña por defecto `Temporal1` | Medio | Hecho: clave aleatoria por usuario enviada por correo (`docs/clave-temporal-usuarios.md`) |

Ya resuelto en rondas anteriores: guard JWT global, validación de headers contra el token, sockets autenticados, autorización por menú, `@SuperUser`, firma SRI cifrada, token de impresora fuera del bundle.

Estado: S2 (`@SuperUser` en errores), S3 (`liquidjs` eliminado; `bcrypt` 5→6, que quita `tar`), S4 (aviso al arrancar con secreto por defecto; no aborta para no tumbar un servidor en marcha) y S10 aplicados. S1 descartado por decisión del propietario. S5–S7 y S8–S9 siguen pendientes.
