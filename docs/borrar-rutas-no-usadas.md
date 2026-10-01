# Borrar rutas no usadas (Administración → Opciones)

Cuando se retira una pantalla del ERP (por ejemplo, Campañas de WhatsApp), su opción queda en `sis_opcion` y los perfiles siguen teniendo el permiso en `sis_perfil_opcion`. Este botón las detecta y las elimina.

## Cómo se usa
1. Con el front actualizado (el archivo `layouts/nav-config-dashboard.tsx` es la fuente de las rutas vigentes), entrar a **Administración → Opciones**.
2. (Recomendado) pulsar **Importar** para sincronizar altas y cambios.
3. Pulsar **Borrar rutas no usadas** (botón rojo, solo administradores).
4. Se abre un diálogo con las opciones detectadas: nombre, ruta, cuántos perfiles tienen permiso y estado. Si no hay ninguna, avisa que todo coincide.
5. **Aceptar y eliminar** borra, en una sola transacción, primero los permisos (`sis_perfil_opcion`) y luego las opciones (`sis_opcion`). **No se puede deshacer.**

## Qué se considera "no usado"
Se compara el archivo de menú con `sis_opcion` del sistema (`ID_SISTEMA`), con la misma regla que la importación:
- una opción con ruta (`tipo_opci`) está en uso si esa ruta aparece en el archivo;
- un grupo sin ruta está en uso si su nombre aparece como grupo en el archivo;
- lo demás es obsoleto.

Una opción obsoleta que aún tiene un hijo en uso **no se elimina** (el diálogo la muestra en "No se eliminarán", con el motivo).

## Seguridad
- `POST /api/sistema/admin/getRutasObsoletas` (detecta): exige el permiso de la pantalla Opciones.
- `POST /api/sistema/admin/eliminarRutasObsoletas` (borra): **solo administradores** (`@SuperUser`).
- El servidor **recalcula** lo obsoleto con el archivo recibido y solo borra la intersección con los `ide_opci` confirmados: un id cualquiera no se elimina. Un archivo sin rutas se rechaza (evita borrar todo por error).
- Cada eliminación queda en el log del backend (usuario y rutas).

## Antes de usarlo
- Confirmar que el front desplegado es el que corresponde (si el archivo de menú está desactualizado, aparecerían rutas vigentes como obsoletas). El diálogo permite revisar la lista antes de aceptar.
- Si la BD tiene otras tablas que referencian `sis_opcion` con clave foránea, el borrado falla completo (transacción) y muestra el error; no queda nada a medias.
- La pantalla elimina; para recuperar una opción hay que volver a importarla (los permisos de perfil habría que reasignarlos).

## Importar con selección

`Importar` ya no ejecuta `f_generar_opciones_proerp` a ciegas (esa función **desactiva todo lo que no venga en el JSON**).
Ahora:

1. `POST sistema/admin/previewImportarOpciones` compara el archivo de menú con `sis_opcion` y devuelve cada ruta/grupo como `nueva`, `cambios` (nombre, grupo, icono, orden, reactivar) o `igual`. No escribe nada.
2. El usuario marca en el diálogo lo que quiere.
3. `POST sistema/admin/importarOpcionesSeleccionadas` (`claves`) recalcula en el servidor, crea los grupos padre que falten y aplica insert/update en una sola transacción. **No desactiva nada**; para retirar rutas se usa "Borrar rutas no usadas".

La función SQL `f_generar_opciones_proerp` y el endpoint `generarOpciones` se conservan sin cambios.
