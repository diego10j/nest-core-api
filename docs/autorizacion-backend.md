# Autorización del backend

El guard JWT global solo garantiza que hay una sesión válida. Faltaba controlar **quién puede hacer qué**: casi todos los endpoints de administración solo pedían sesión, y que una pantalla no apareciera en el menú dependía únicamente del front.

## Hallazgos (por gravedad)

| Gravedad | Endpoint | Problema | Estado |
|---|---|---|---|
| **Crítica** | `POST auth/resetPassword` | Cualquier usuario con sesión podía resetear la clave de **cualquier** usuario (incluido un administrador) a `Temporal1`, valor visible en un repo público, y luego entrar como él | Corregido |
| **Crítica** | `POST sistema/usuarios/saveConfigPassword` | Igual: fija la clave de cualquier usuario sin comprobar permisos | Corregido |
| Alta | `POST sistema/admin/generarOpciones`, `GET/POST sistema/admin/getOpcionesPerfil`, `saveOpcionesPerfil` | Cualquier usuario podía reescribir el menú o los permisos de un perfil | Corregido |
| Alta | `POST sri/configuracion/saveEmisor`, `saveFirma`, `uploadFirma`, `validateFirma` | Cualquier usuario podía cambiar la firma electrónica y el emisor del SRI | Corregido |
| Media | `POST core/clearCacheRedis`, `refreshTableColumns` | Cualquier usuario podía vaciar toda la caché de Redis (incluidos los bloqueos de login) | Corregido (solo administradores) |
| **Crítica** | `POST core/save`, `GET core/getTableQuery`, `getTreeModel`, `isUnique` | Endpoints genéricos: el cliente envía módulo, tabla, columnas y la `condition` como **texto SQL** que se concatena. Cualquier usuario con sesión puede leer o modificar cualquier tabla | **Pendiente** (ver abajo) |
| Alta | `GET ventas/pos-punto-venta/getConfigPOS?ide_usua=` | Devuelve el token de la impresora de **cualquier** usuario que se pida | Pendiente |

## Qué se hizo: `@RequireMenu(...)`
Un endpoint de administración solo lo puede usar quien tenga, **en su perfil activo**, la opción de menú de esa pantalla (la misma tabla de la que sale el menú, `sis_perfil_opcion`), o sea administrador del sistema (`admin_usua`).

```ts
@Post('resetPassword')
@RequireMenu('/dashboard/sistema/usuarios/list')
resetPassword(...) { ... }
```

- El perfil se toma de `X-Ide-Perf`, ya validado contra los perfiles del token: no se puede usar el perfil de otra persona.
- La respuesta de la BD se recuerda 60 s en Redis: un cambio de permisos tarda hasta un minuto en notarse.
- Las consultas usan parámetros.
- **No cambia el flujo de quien ya usa esas pantallas**: si su perfil ve la pantalla en el menú, tiene la opción y el endpoint le responde igual.
- `@SuperUser()` es la variante solo para administradores del sistema.

| Endpoint | Exige la opción de menú |
|---|---|
| `auth/resetPassword`, `sistema/usuarios/getConfigPassword`, `saveConfigPassword` | `/dashboard/sistema/usuarios/list` |
| `sistema/admin/generarOpciones` | `/dashboard/sistema/opciones` |
| `sistema/admin/getOpcionesPerfil`, `saveOpcionesPerfil` | `/dashboard/seguridad/perfil-opcion` |
| `sri/configuracion/saveEmisor`, `saveFirma`, `uploadFirma`, `validateFirma` | `/dashboard/sri/configuracion-emision` |
| `core/clearCacheRedis`, `refreshTableColumns`, `sri/configuracion/cifrarClave` | administrador del sistema |

Se verificó en `react-front-erp` que estos endpoints solo los llaman las pantallas correspondientes (`usuario-edit`, `config-clave-usuario-frm`, `opcion-list`, `perfil-opcion`, `configuracion-emision`).

## Despliegue
Usa el mismo interruptor `AUTH_GUARD_MODE` que la autenticación: con `warn` solo registra en el log lo que bloquearía (`[warn-mode] ... denegado a <login>: el perfil N no tiene la opción ...`); con `enforce` responde 403. Primero `warn`, revisar el log unos días y luego `enforce`.

## Pendiente: los endpoints genéricos (`core/*`)
Es el riesgo mayor que queda. El front arma las operaciones (`save`, `getTableQuery`…) indicando tabla y condiciones, y el backend las ejecuta tal cual. Propuesta, por fases y con modo `warn` primero:
1. **Lista de tablas permitidas** para `core/save`, construida a partir de las que el front realmente escribe; el resto se rechaza (las claves, firmas, permisos y credenciales tienen sus endpoints propios).
2. **Validar `condition`**: solo comparaciones simples (`columna = número`, `IN (...)`, combinadas con `AND`), nada de subconsultas ni comentarios.
3. Validar nombres de tabla y columna contra el catálogo de la BD en vez de concatenarlos.
4. Corregir `getConfigPOS` para que use el usuario del token.
