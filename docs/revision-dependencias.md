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

## 3. Orden sugerido
1. Backend: quitar lo sin uso + un solo lockfile + Nivel 1 → `yarn audit`.
2. Front: Nivel 1 + cambiar `xlsx` por la versión del CDN.
3. Backend: Nest 11 (rama propia, probar rutas, descargas y sockets).
4. Front: MUI X 9 → tiptap 3 / BlockNote → Vite 8 → MUI material 9.
5. Dejar para después: React Router 8, TypeScript 7, ESLint 10, uuid.
