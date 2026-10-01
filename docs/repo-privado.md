# Hacer privado `nest-core-api`: qué cambia

Se recomienda hacerlo: el repo contiene la clave antigua de cifrado, las IPs permitidas en CORS y toda la lógica del ERP. Es reversible.

## Lo que SÍ se verá afectado

1. **El despliegue en el servidor.** `deploy.sh` ejecuta `git pull` en `/proerp/backend/nest-core-api`, con el remoto `https://github.com/diego10j/nest-core-api`. Si hoy se descarga sin credenciales (porque el repo es público), al hacerlo privado el `git pull` fallará con un error de autenticación y **el despliegue se detiene**. Hay que configurar el acceso del servidor *antes* de cambiar la visibilidad:
   - Recomendado: una **deploy key de solo lectura**. En el servidor: `ssh-keygen -t ed25519 -f ~/.ssh/nest_core_deploy -N ""`; en GitHub, *Settings ▸ Deploy keys ▸ Add* con la clave pública (sin permiso de escritura); y `git remote set-url origin git@github.com:diego10j/nest-core-api.git` (con `~/.ssh/config` apuntando a esa clave).
   - Alternativa: un *fine-grained personal access token* de solo lectura sobre este repo.
   - Probar con `git pull` en el servidor antes de cambiar la visibilidad (con el repo aún público, para comprobar que la credencial funciona).
2. **Los equipos de desarrollo.** Las máquinas desde las que ya haces `git push` ya están autenticadas y siguen funcionando. Las que solo hacen `git pull` o `git clone` sin iniciar sesión dejarán de funcionar hasta que inicien sesión en GitHub (Git Credential Manager, SSH o token). Si alguna usa un token clásico con alcance solo `public_repo`, necesita `repo`.
3. **Estrellas y observadores.** Según la documentación de GitHub, al pasar a privado se pierden las estrellas y los observadores.
4. **Los forks públicos** se desvinculan y se quedan con una copia pública del código y de su historial.

## Lo que NO se ve afectado
- No hay flujos de CI: la carpeta `.github` solo contiene `skills`.
- Las sesiones de Claude Code que ya tienen acceso a tu cuenta.
- El front (`react-front-erp`) y `page-diquimec` ya son privados.

## Lo que hacerlo privado NO soluciona
La clave antigua y cualquier copia ya clonada, un fork o una caché siguen existiendo. Hacerlo privado reduce la exposición futura, pero **la rotación sigue siendo necesaria** (fases C y D de `docs/firma-sri-plan.md`).

## Orden recomendado
1. Configurar la credencial de solo lectura en el servidor y probar `git pull`.
2. Revisar *Insights ▸ Forks* y cada equipo de desarrollo.
3. Cambiar la visibilidad: *Settings ▸ General ▸ Danger Zone ▸ Change repository visibility*.
4. Probar un despliegue con `deploy.sh`.
