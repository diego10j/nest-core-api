# nest-core-api — contexto para Claude Code

## Base de conocimiento del ERP (Obsidian vault)

Existe un vault de conocimiento del ERP, **fuera de este repo**, en:
`/mnt/d/DIEGO2022/Varios/git/erp-knowledge`

Cubre lo que no vive bien en el código ni en comentarios sueltos:

- `_Glosario-Tablas/` — tablas cuyo nombre o comportamiento engaña (ej. `cxp_cabecera_nota`
  es de Ventas pese al prefijo `cxp_`; timestamps de WhatsApp que parecen UTC pero son hora
  Ecuador). **Antes de asumir qué hace una tabla por su nombre, revisar si tiene nota acá.**
- `_Schema-Completo/` — una nota por cada una de las ~492 tablas del schema `public` de
  `sigafi_dbo` (generada por script desde `information_schema`, no a mano), con columnas y
  FKs entrantes/salientes. Útil para consultar la estructura real de una tabla sin correr
  psql.
- `Ventas/`, `Compras/`, `Tesoreria/`, `Contabilidad/`, `Inventario/`, `SRI/`,
  `WhatsApp-Bot/` — una nota "MOC" por módulo con lo que se sabe de ese dominio.
- `_Decisiones/` — decisiones de arquitectura no obvias, con su motivo.

**Cuándo consultarlo**: antes de tocar un módulo con historia (tesorería, notas de
crédito, WhatsApp, SRI), o cuando algo en el esquema no cuadra con lo que dice el nombre de
la tabla/columna — puede que ya esté documentado ahí.

**Cuándo escribir ahí**: si encontrás un gotcha real (nombre engañoso, comportamiento de
Postgres sorprendente, regla de negocio no obvia) mientras trabajás en este repo, vale la
pena agregar una nota corta en `_Glosario-Tablas/` siguiendo `_Plantilla-Tabla.md` — no
hace falta pedir permiso para leerlo o proponer agregar una nota ahí cuando aplique.

Es un repo git aparte (no touchear su `.git` desde acá) — se sincroniza vía el plugin
Obsidian Git en las PCs del usuario, remote en su servidor Debian propio (no en GitHub).
