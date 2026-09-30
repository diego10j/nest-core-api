---
name: postgres-date-time-columns
description: >
  How DATE, TIME and TIMESTAMP columns come back from Postgres in this backend (nest-core-api)
  and how to combine them safely in a query or DTO. Use this whenever you write or touch a query,
  service method, or DTO that reads fecha_ingre/hora_ingre (or any other fecha_*/hora_* pair),
  combines a date column with a time column, builds a timestamp to compare against another table,
  or pipes a date/time value from one query into another. Also use it if you hit a Postgres error
  like "invalid input syntax for type timestamp" or "invalid input syntax for type time" coming
  from a value that was built in JavaScript instead of SQL.
---

# Fechas y horas de Postgres en este backend

## Por qué esto existe

`DataSourceService` (`src/core/connection/datasource.service.ts`) registra parsers de tipo
**globales** para `pg` que cambian lo que JavaScript recibe cuando una columna es `DATE` o
`TIME`. Son deliberados (corrigen bugs reales de timezone), pero el valor que llega a tu código
no es el que esperarías si nunca los revisaste. Combinar estos valores a mano en JS produjo un
bug real: un `getWhatsappChat` que armaba `` `${fecha_ingre}T${hora_ingre}` `` terminó mandándole
a Postgres el timestamp `"2026-09-30T1989-07-11T08:53:06"` — inválido, 500 en el endpoint
(caso real detectado 2026-09-30, ver `proformas.service.ts` → `getWhatsappChat`).

## Qué llega realmente a JS

| Tipo Postgres | OID | Parser activo | Qué recibe tu código |
|---|---|---|---|
| `DATE` | 1082 | `(val) => val` | El texto crudo `'YYYY-MM-DD'`, tal cual. Nunca pasa por `Date`. |
| `TIME` | 1083 | `getTimeISOFormat` | **No** es `"HH:MM:SS"`. Es `"1989-07-11THH:MM:SS"` — le antepone una fecha ficticia fija para poder tratarlo como ISO en otros lugares. Ver `src/util/helpers/date-util.ts:98`. |
| `TIMESTAMP` / `TIMESTAMPTZ` | 1114 / 1184 | ninguno (comentado en `datasource.service.ts`) | El parser **default** de `pg`: un objeto `Date`, interpretado como si el valor naive fuera hora local del proceso Node. |

Hay un segundo archivo, `src/core/connection/type-parser/type-parser.service.ts`, con parsers
distintos para estos mismos tipos (incluyendo uno que sí convierte TIMESTAMP a ISO string
marcado UTC). **No está en uso** — `registerParsers()` no se llama desde ningún lado. No te dejes
confundir por él: lo que manda es `DataSourceService`.

## La regla

**Nunca combines fecha + hora armando un string en JavaScript.** El valor de `TIME` no es lo que
parece (trae esa fecha `1989-07-11` pegada) y concatenarlo con una `DATE` real produce un
timestamp con dos fechas adentro, como pasó en el bug de arriba.

Si necesitás una fecha+hora combinada — para comparar contra otra columna, para pasarla como
parámetro a otra query, para lo que sea — hacé la aritmética **en SQL**, nunca en JS. Es el
patrón que ya usa el resto del proyecto:

```sql
-- Ejemplo real: src/core/modules/base-tecnica/bdt-archivos.service.ts:79
(a.fecha_ingre + COALESCE(a.hora_ingre, TIME '00:00')) AS fecha_carga
```

```sql
-- Otra variante ya usada (concatenación de texto, sirve para mostrar, no para castear a timestamp):
a.fecha_ingre || ' ' || a.hora_ingre AS fecha_ingre
```

Postgres suma una `DATE` y una `TIME` directo (`date + time = timestamp`) sin que ninguno de los
dos valores pase nunca por el parser raro de JS — porque nunca salen de Postgres hasta que ya
están combinados.

### Si el resultado combinado se usa en OTRA query

Pasalo como **parámetro ligado** (`addParam`/`addIntParam`), nunca interpolado en el texto del
SQL. El valor que vuelve de un `SELECT ... AS momento` (tipo `timestamp`) llega como un objeto
`Date` de JS (ver tabla arriba) — `pg` sabe serializar un `Date` correctamente al pasarlo como
parámetro, así que simplemente reenvialo tal cual:

```ts
// proformas.service.ts → getWhatsappChat (versión corregida)
const cabQ = new SelectQuery(`
  SELECT ...,
         COALESCE(fecha_ingre + COALESCE(hora_ingre, TIME '00:00'), fecha_cccpr::timestamp) AS momento_creacion
  FROM cxc_cabece_proforma
  WHERE ide_cccpr = $1 AND ide_empr = $2
`);
// ...
const cabecera = await this.dataSource.createSingleQuery(cabQ);

const chatQ = new SelectQuery(`... WHERE ... - $3::timestamp ...`);
chatQ.addParam(3, cabecera.momento_creacion); // Date object, no armado a mano
```

## Checklist rápido antes de tocar fecha_*/hora_*

1. ¿Estoy combinando una columna `DATE` con una `TIME`? → Hacelo en el `SELECT` con `+`, no con
   template strings de JS.
2. ¿Voy a pasar una fecha/hora de una query a otra? → Devolvela ya combinada desde SQL (tipo
   `timestamp`) y pasala como parámetro ligado, no interpolada.
3. ¿Necesito mostrarle al usuario `hora_ingre` sola? → Acordate que el string trae
   `"1989-07-11T"` pegado adelante; si de verdad necesitás solo la hora en JS (no lo hagas para
   armar timestamps, ver regla de arriba), es `valor.split('T')[1]`.
4. ¿El bug que estoy viendo es "invalid input syntax for type timestamp/time"? → Casi seguro el
   valor se armó en JS. Revisá si venía de una columna `TIME` concatenada a mano.
