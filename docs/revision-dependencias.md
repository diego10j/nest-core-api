# Revisión de dependencias (backend `nest-core-api` y front `react-front-erp`)

Fecha de la revisión: 2026-10-01. **No se modificó ningún `package.json`**: este documento es la base para decidir.
Método: búsqueda de uso real en `src/` (+ `depcheck`), `npm outdated`, `npm audit` / `yarn audit` y consulta de `engines` / `peerDependencies` de cada candidato en npm.

> Un `depcheck` suelto da falsos positivos (peer deps, imports dinámicos, tipos). Lo que figura como "quitar" fue verificado a mano con búsqueda en el código.

---

## 1. Backend

### 1.1 Se pueden quitar (sin uso verificado)

| Paquete | Motivo |
|---|---|
| `@nestjs-modules/mailer`, `mjml`, `ejs`, `pug`, `preview-email`, `@types/ejs`, `@types/mjml`, `@types/pug` | El correo hoy va por Resend + Handlebars propio (`TemplateService`). Ningún `import`. Son la fuente de buena parte de las vulnerabilidades (`mjml`, `preview-email`, `liquidjs`, `tar`). |
| `playwright`, `playwright-extra`, `puppeteer-extra-plugin-stealth` | Ningún `import`/`launch` en `src/`. Descarga navegadores y pesa mucho. |
| `p-queue`, `@types/p-queue` | Sin uso (y `@types/p-queue` es un stub obsoleto). |
| `cors` | Se usa `app.enableCors` de Nest, no el paquete. |
| `passport-local`, `@types/passport-local` | La autenticación es JWT; no hay estrategia local. |
| `qrcode-terminal` | Era del bot antiguo de WhatsApp. |
| `rimraf`, `webpack`, `ts-loader` | `nest build` usa `tsc` (no hay `webpack: true` en `nest-cli.json`). |
| `cross-port-killer`, `eslint-plugin-prettier` | No se referencian (el eslint usa solo `eslint-config-prettier`). |

**Mantener aunque `depcheck` los marque:** `passport` (peer de `@nestjs/passport`), `reflect-metadata` (requerido por Nest), `unpdf` (se carga con `import()` dinámico en `pdf-texto.helper.ts`), `@nestjs/schematics` (colección del CLI), `@types/jest`, `tsconfig-paths` (script `test:debug`), `source-map-support` (inocuo; opcional).

**Declarar (se importan pero no están en `package.json`):** `form-data` (lo usan `ocr.service.ts` y `ycloud.service.ts`; hoy llega por `axios`). `express` y `multer` llegan por `@nestjs/platform-express`; es aceptable, solo es frágil.

### 1.2 Hallazgos de higiene
- **Hay dos lockfiles** (`package-lock.json` y `yarn.lock`). `deploy.sh` usa `yarn`; `npm audit` lee `package-lock.json`. Se recomienda dejar **uno solo** (yarn) para que no se desincronicen.
- `@types/express` está en 5.x pero el runtime es **Express 4.22** (Nest 10). Se alinea al pasar a Nest 11.
- `@types/node` 20 vs Node 22 en desarrollo: confirmar la versión de Node de producción y alinear.

### 1.3 Seguridad (`npm audit --omit=dev`, contra `package-lock.json`)
79 hallazgos (3 críticos, 62 altos); la mayoría **transitivos de paquetes que se pueden quitar**. Críticos: `piscina`, `liquidjs`, `tar`. Directos con arreglo:
- `piscina` 5.1.4 → 5.3.2 (menor, sin ruptura).
- `axios` 1.16 → 1.20 (menor).
- `bcrypt`, `preview-email`: arreglo menor / se quita.
- `@nestjs/platform-express` y `@nestjs/serve-static`: el arreglo es subir de mayor (Nest 11/12).
- `sharp` 0.33.5 → 0.35.x: mayor, pide Node ≥ 22.
Después de quitar lo sin uso y fijar un solo lockfile conviene volver a correr `yarn audit` para ver la cifra real.

### 1.4 Plan por niveles

**Nivel 1 – seguro (mismo mayor, parches/menores).** Probar `yarn build` + `jest`; con `ec-sri-invoice-signer` probar la firma del SRI en pruebas.
`@nestjs/common|core|testing|platform-express|platform-socket.io|websockets` 10.4.15/22 → 10.4.22 · `axios` · `piscina` · `bwip-js` · `class-validator` 0.14.4 · `date-fns` · `ec-sri-invoice-signer` 1.8.2 · `helmet` · `ioredis` 5.11 · `pg` 8.23 · `resend` 6.31 · `rxjs` 7.8.2 · `socket.io` 4.8.4 · `@nestjs/throttler` 6.7 · `zod` 4.6 · `typescript-eslint`/`@typescript-eslint/*` 8.71 · `eslint` 9.39.5 · `prettier` 3.9.9 · `supertest` · `reflect-metadata` 0.2.2 (recomendado por Nest 11).

**Nivel 2 – planificado (mayor, requiere pruebas funcionales).**
- **Nest 10 → 11** (o 12). Compatibilidad verificada: `@nestjs/jwt` 11, `config` 4, `schedule` 6, `passport` 11 y `throttler` 6 **ya declaran soporte para Nest 10 y 11**, no hay que tocarlos. Sí hay que subir a la vez: `@nestjs/swagger` 7 → 11/12 (el 7 solo acepta Nest 9/10), `@nestjs/serve-static` 4 → 5/12 (el 4 solo acepta Nest 9/10), `@nestjs/cli`, `@nestjs/schematics`, `@nestjs/mapped-types`. **Riesgo principal:** Nest 11 usa **Express 5** (sintaxis de rutas con `*`, parser de query, `serve-static` con `exclude`). Revisar `main.ts`, `socket-io.adapter.ts`, rutas con comodines y los endpoints de descarga de archivos. Nest 12 exige Node ≥ 20 y TS 5.5+; leer su guía de migración antes de elegir el salto directo.
- `jest` 29 → 30 con `ts-jest` 29.4.14 (declara soporte para Jest 29 y 30 y TS < 7). Riesgo bajo-medio.
- `sharp` → 0.35 (requiere Node ≥ 22 en producción).
- `ioredis` 5 → 6 (Node ≥ 20; revisar manejo de Redis DB 1–4 que usa el módulo de auth).
- `openai` 4 → 7 y `pdfmake` 0.2 → 0.3 (cambios de API; solo si se necesita algo nuevo).

**Nivel 3 – esperar / no subir.**
- `uuid` 9 → 14 y `p-queue` 9: son **solo ESM** (`type: module`); el proyecto compila a CommonJS y se rompería. Para uuid, usar `crypto.randomUUID()` si se quiere dejar la dependencia.
- `typescript` 7: `typescript-eslint` aún exige < 6.1. Quedarse en 5.9.
- `eslint` 10: depende de los plugins (ver front).
- `dotenv` 17/18, `@types/uuid` 10, `@kurkle/color` 0.6: sin beneficio claro.

---

## 2. Frontend

### 2.1 Quitar
Prácticamente nada. Lo que `depcheck`/búsqueda marcan es **falso positivo**:
- `@emotion/styled`, `stylis`, `apexcharts`, `@tiptap/core`, `@tiptap/pm`, `@tiptap/extension-code-block`: son **peer dependencies** de MUI / `react-apexcharts` / extensiones de tiptap; hay que mantenerlas.
- `@fontsource*` y `@tiptap/starter-kit`: sí se importan; mantener.
- Dev `@types/*`, `typescript`, `eslint`: se usan implícitamente.
- Únicos candidatos menores: `@typescript-eslint/parser` (redundante: ya lo trae `typescript-eslint`) y `@types/stylis`. Beneficio mínimo.

**Declarar:** se importan extensiones de tiptap (`extension-bold`, `text`, `code`, `italic`, `strike`, `heading`, `paragraph`, `list-item`, `ordered-list`…) que no están en `package.json` y llegan por `starter-kit`. Funciona, pero es frágil.

### 2.2 Seguridad (`yarn audit`)
- `xlsx` 0.18.5 (2 altos): **SheetJS ya no publica en npm**; el arreglo es instalar la versión del CDN oficial (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`). En este proyecto `xlsx` solo se usa para **exportar** (`exportDataTable.tsx`), que es el caso de menor riesgo (el fallo está al *leer* archivos no confiables), pero conviene cambiarlo.
- `@tiptap/core` < 3.30.4 (moderado): se resuelve al pasar tiptap a 3.x.

### 2.3 Plan por niveles

**Nivel 1 – seguro.** `@types/node` 24.19 · `emoji-picker-react` 4.22.3 · `prettier` 3.9.9 · `react-hook-form` 7.89 · `react-map-gl` 8.1.3 · `socket.io-client` 4.8.4 · `typescript-eslint` + `@typescript-eslint/parser` 8.71 · `@vitejs/plugin-react-swc` 4.x (declara soporte para Vite 4–8) · `vite-plugin-checker` 0.14 (pide eslint ≥ 9.39.4: se cumple) · `mui-one-time-password-input` 7 (acepta `@mui/material` 7 y 9) · `globals`.

**Nivel 2 – planificado.**
- **`@mui/x-data-grid`, `x-date-pickers`, `x-tree-view` 8 → 9**: la v9 acepta `@mui/material` **7.3 o 9**, así que se puede subir sin tocar `@mui/material`. Riesgo medio (cambios de API en la grid y los pickers).
- **`@mui/material` 7 → 9** (+ `@mui/lab` 9 beta, que exige exactamente `@mui/material` ^9.4): cambio grande. Ya se eliminó `LoadingButton`, lo que ayuda. Hacerlo después de las X y en una rama aparte.
- **tiptap 2 → 3** (`@tiptap/*`): BlockNote **ya usa tiptap 3** (por eso existen los `resolutions` de prosemirror y hoy conviven dos versiones). Unificar reduce peso y elimina el hallazgo moderado, pero hay cambios de API en el editor propio (`components/editor`).
- `@blocknote/*` 0.54 → 0.55 (versión 0.x: puede romper; probar el editor).
- `i18next` 25 → 26 **junto con** `react-i18next` 17 (este exige i18next ≥ 26.2).
- `react-apexcharts` 2 **junto con** `apexcharts` ≥ 5.10 (hoy 4.7).
- `vite` 6 → 8 (Rolldown; Node ≥ 20.19; revisar `vite.config.ts`, chunks manuales y plugins).
- `eslint-plugin-react-hooks` 5 → 7 (reglas nuevas; saldrán más avisos) y `eslint-plugin-perfectionist` 4 → 5 (reglas de orden de imports).
- `framer-motion` 12 → 13.

**Nivel 3 – esperar / no subir.**
- `react-router` 8: exige **Node ≥ 22.22** y React ≥ 19.2.7; el proyecto declara `node >=20`.
- `typescript` 7: `typescript-eslint` exige < 6.1.
- `eslint` 10 y `@eslint/js` 10: `eslint-plugin-react` 7.37, `eslint-plugin-jsx-a11y` 6.10 y `eslint-plugin-import` 2.32 **no declaran soporte para ESLint 10**. Quedarse en ESLint 9.
- `zod` 3 → 4 (`@hookform/resolvers` 5 ya soporta ambos; es migración de código de esquemas; el backend ya está en zod 4).
- `@tanstack/react-table` 9 (reescritura), `@tanstack/match-sorter-utils` 9, `@fullcalendar/*` 7 (requiere `temporal-polyfill`), `react-dropzone` 20.

---

## 3. Estado de ejecución

### Fase 1 – backend (HECHA, commit `fb3fb4f`)
- Se quitaron 23 paquetes sin uso (ver 1.1) y se eliminó `package-lock.json`: **queda solo `yarn.lock`**.
- Se declaró `form-data` y se actualizaron parches/menores dentro de los rangos (Nest 10.4.22, axios, piscina, ioredis, pg, resend, zod 4.6, etc.) y `reflect-metadata` 0.2.2.
- Resultado: `nest build` OK, 136 tests OK. `yarn audit` (producción): **críticos 3 → 0; altos 62 → 14**.
- Los 14 altos restantes vienen de Nest 10 (`path-to-regexp` por `serve-static`, `lodash`/`js-yaml` por `swagger`, `multer` por `platform-express`) y de `sharp` 0.33: se resuelven en las fases 3 y 4.

### Fase 2 – front (HECHA salvo `xlsx`, rama `claude/front-deps-fase1`)
- Subidas: `react-map-gl` 8.1.3, `vite-plugin-checker` 0.14, `mui-one-time-password-input` 7, `globals` 17 y menores/parches (`eslint`, `prettier`, `react-hook-form`, `socket.io-client`, `@types/node`, `emoji-picker-react`, MUI y MUI X dentro de su mayor).
- **`typescript-eslint` y su parser se quedan en 8.50.1.** Con 8.71 la regla `@typescript-eslint/no-shadow` marca 46 errores falsos en patrones `const X = memo(function X() {})`, y como `vite-plugin-checker` 0.14 ejecuta ESLint durante `vite build`, el build fallaba. Retomar en la fase 7, junto con la revisión de la configuración de ESLint.
- **`@vitejs/plugin-react-swc` se queda en 3.11 (confirmado).** Con la v4, exportar en Facturas dejó el navegador sin recursos (`ERR_INSUFFICIENT_RESOURCES`, cientos de peticiones); con el commit anterior a la fase 2 y con la v3.11 vuelve a exportar bien (probado con más de 300 filas). No se reintenta la v4 hasta la fase 7 (Vite 8) y, entonces, probando primero la exportación en Facturas. No se investigó la causa raíz dentro del plugin.
- **Pendiente manual – `xlsx`:** el CDN de SheetJS no es accesible desde el entorno de Claude (403 del proxy). Ejecutar en tu máquina:
  `yarn add https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`
  y probar los botones de exportar a Excel (`exportDataTable.tsx`).

---

## 4. Plan de las siguientes fases

Cada fase va en **su propia rama**, con `build` + tests + lint antes de subir, y se mezcla en `integracion` solo si pasa. Después de cada fase del backend: volver a correr `yarn audit`.

### Fase 3 – Backend: Nest 10 → 11 (riesgo medio-alto)
1. Rama `deps/nest-11`. Subir juntos: `@nestjs/common|core|platform-express|platform-socket.io|websockets|testing` 11, `@nestjs/cli` 11, `@nestjs/schematics` 11, `@nestjs/swagger` 11, `@nestjs/serve-static` 5, `@nestjs/mapped-types` 2.1. (`jwt`, `config`, `schedule`, `passport` y `throttler` ya soportan Nest 11.) `@types/express` queda en 5.
2. **Express 5**: revisar rutas con comodín (`*`), `ServeStaticModule` (`exclude`, `renderPath`), parser de query (ahora `simple`: afecta a filtros con arreglos/objetos en query string), `req.query` de solo lectura, y `app.setGlobalPrefix`.
3. Probar a mano: login/refresh, sockets (WhatsApp y notificaciones), subida y descarga de archivos (`files/*`), Swagger, reportes PDF, firma/envío SRI en pruebas, cron jobs.
4. Criterio de salida: `yarn audit` sin altos por `path-to-regexp`, `lodash`, `js-yaml` ni `multer`.
5. Decidir Nest 12 después, con su guía de migración (exige Node ≥ 20 y TypeScript ≥ 5.5).

### Fase 4 – Backend: herramientas y nativos (riesgo medio)
- `sharp` 0.33 → 0.35 (**requiere Node ≥ 22 en producción**: confirmar versión de Node del servidor antes). Probar generación/optimización de imágenes y el OCR/PDF que las use.
- `jest` 30 + `ts-jest` 29.4 + `@types/jest` 30 (`ts-jest` ya declara Jest 29 y 30).
- `ioredis` 6: revisar el módulo de auth (Redis DB 1–4: lista negra, intentos, refresh, recuperación).
- `openai` 4 → 7 y `pdfmake` 0.2 → 0.3 solo si hace falta una función nueva (cambian las APIs).
- Alinear `@types/node` con la versión de Node de producción.

### Fase 5 – Front: MUI X 9 (riesgo medio)
- `@mui/x-data-grid`, `x-date-pickers`, `x-tree-view` 8 → 9 (aceptan `@mui/material` 7.3, así que no hay que tocar material). Probar todas las pantallas con grilla, fechas y árbol (Opciones, Perfiles, listados con filtros).

### Fase 6 – Front: editor y libs de UI (riesgo medio)
- **tiptap 2 → 3** (`@tiptap/*`), unificando con BlockNote (que ya usa tiptap 3) y quitando los `resolutions` de prosemirror. Cambios de API en `components/editor`. Resuelve el hallazgo moderado de `@tiptap/core`.
- `@blocknote/*` 0.54 → 0.55 (0.x puede romper; probar el editor).
- `i18next` 26 **junto con** `react-i18next` 17.
- `apexcharts` ≥ 5.10 **junto con** `react-apexcharts` 2.
- `framer-motion` 13.

### Fase 7 – Front: build y lint (riesgo medio-alto)
- `vite` 6 → 8 (Rolldown): revisar `vite.config.ts` (chunks manuales, visualizer, alias), el warning de chunks y el build de producción en `vercel.json`/servidor.
- `eslint-plugin-react-hooks` 5 → 7 y `eslint-plugin-perfectionist` 4 → 5 (saldrán avisos nuevos; ajustar la config, no el código de negocio).

### Fase 8 – Front: `@mui/material` 7 → 9 (riesgo alto)
- Después de la fase 5. Con `@mui/lab` 9 beta (exige `@mui/material` ^9.4) y `@mui/stylis-plugin-rtl` 9. Revisar el tema (`theme/`), componentes sobrescritos y los `slotProps`. Rama aparte y revisión visual completa.

### En espera (no subir todavía)
`react-router` 8 (Node ≥ 22.22 y React ≥ 19.2.7), `typescript` 7 (`typescript-eslint` exige < 6.1), `eslint` 10 (`eslint-plugin-react`, `jsx-a11y` e `import` no lo soportan), `uuid` ≥ 12 y `p-queue` ≥ 9 (solo ESM; el backend es CommonJS), `zod` 3 → 4 en el front, `@tanstack/react-table` 9, `@fullcalendar/*` 7, `react-dropzone` 20.
