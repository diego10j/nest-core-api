# Accesibilidad del front (react-front-erp): inventario de lo que hay que corregir

Método: barrido estático de los 1199 `.tsx` (script que analiza las etiquetas JSX). **No** se ejecutó la app ni un lector de pantalla ni un auditor de contraste, así que:
- los números son aproximados (pueden incluir falsos positivos, p. ej. botones que reciben `aria-label` por `{...props}`; MUI `Tooltip` con `title` ya nombra a su hijo y se contó como correcto);
- faltan las comprobaciones dinámicas (contraste, orden de foco, lector de pantalla), listadas en la sección 4.
Listado completo por archivo y línea: `docs/front-accesibilidad-listado.txt`. No se cambió código.

## 1. Resumen
| Id | Problema | Casos | Archivos | Gravedad |
|---|---|---|---|---|
| A1 | `IconButton` sin nombre accesible (ni `aria-label` ni `Tooltip` con `title`) | ~310 de 688 | ~207 | Alta |
| A2 | `onClick` en `div`/`Box`/`Stack`/`TableCell`/`TableRow` sin `role`, `tabIndex` ni teclado | ~100 | ~80 | Alta |
| A3 | Imágenes sin `alt` (`<img>` y `<Box component="img">`) | 15 | 12 | Media |
| A4 | `TextField` sin `label` ni `aria-label` | ~56 | 43 | Alta |
| A5 | `Switch` sin nombre accesible | ~82 | 51 | Alta |
| A6 | `Checkbox` sin nombre accesible | ~41 | 23 | Alta |
| A7 | `Dialog` sin `aria-labelledby` | ~192 | 175 | Media |
| A8 | `outline: none` que quita el foco visible | 8 | 6 | Alta |
| A9 | `autoFocus` (aceptable en diálogos de captura; revisar el resto) | 34 | 27 | Baja |
| A10 | `Link href="#"` en el login | 1 | 1 | Baja |

Hay 190 `aria-label` en todo el proyecto frente a ~688 botones de icono, y 0 usos de `prefers-reduced-motion`.

## 2. Qué corregir, por prioridad

**P1 — Componentes compartidos (un arreglo corrige muchos sitios)**
1. `core/components/dataTable/*`: botones de paginación (primera/anterior/siguiente/última) sin nombre; filas clicables (`RowDataTable`) sin rol/teclado; la tabla no declara `role="grid"`/`aria-sort`/`aria-rowcount` (importante con la virtualización); celdas editables (`EditableCell`) con `outline: none` en `EditableCell.tsx:135`.
2. Botones reutilizables de `components/`: `phone-input`, `upload` (`DeleteButton`), `file-thumbnail`, `fullscreen-button`, `list-popover`.
3. Un wrapper `IconButton` propio que **exija** `aria-label` por tipos (TypeScript) para que no vuelva a pasar.
4. `components/editor/styles.tsx` y `components/upload/upload.tsx`: `outline: none` → sustituir por `:focus-visible` con anillo visible.

**P2 — Formularios**
5. Todo `TextField`, `Switch`, `Checkbox` con nombre: `label`, o `FormControlLabel`, o `slotProps.input/htmlInput['aria-label']`.
6. Errores de validación asociados con `aria-describedby` (usar `helperText` de MUI, que ya lo hace) y `aria-invalid`.
7. Campos obligatorios marcados con `required` real, no solo con asterisco visual.
8. Guardado/validación con mensajes en región `aria-live`.

**P3 — Interacción por teclado**
9. Reemplazar `onClick` sobre `div`/`Stack`/`TableCell` por `ButtonBase`/`Link`/`component="button"`, o añadir `role="button"` + `tabIndex={0}` + Enter/Espacio. Casos destacados: `file-manager-*`, `correos-view`, `conocimiento-view-dialog`, `layouts/components/searchbar`.
10. Diálogos: `aria-labelledby` apuntando al `DialogTitle`, foco inicial lógico y devolución del foco al cerrar (MUI lo hace si no se rompe con `autoFocus` raro).
11. Menús y popovers: cierre con Esc, foco atrapado, flechas en listas.

**P4 — Contenido y estructura**
12. `alt` descriptivo en imágenes informativas y `alt=""` en decorativas (`bancos-list.tsx:731`, `liquidacion-compra-toolbar.tsx:167`, `documento-tecnico-dialog.tsx:708`, `conocimiento-adjuntos.tsx:81`, `ViewMovimientoBancoDialog.tsx:313`, `file-manager-*`).
13. Un único `<h1>` por pantalla y jerarquía de títulos; `routes/components/error-boundary.tsx` usa `h*` crudos.
14. Título de página por ruta (`document.title`): hoy el título es fijo "Pro-ERP" salvo unas pocas pantallas.
15. `Link href="#"` en `auth/view/jwt/jwt-sign-in-view.tsx:142` → botón o ruta real.
16. Enlace "Saltar al contenido" al inicio del layout.
17. `aria-current="page"` en el ítem activo del menú lateral; `nav` con `aria-label`.

**P5 — Visual**
18. Foco visible global (`:focus-visible`) en el tema MUI, con contraste ≥ 3:1.
19. `prefers-reduced-motion` para animaciones y transiciones.
20. Contraste de color ≥ 4.5:1 (texto) y 3:1 (iconos/bordes), en modo claro y oscuro (los chips de estado y textos `text.disabled` suelen fallar).
21. Objetivos táctiles ≥ 24×24 px (WCAG 2.2): los botones `size="small"` con `p: 0.5` y iconos de 16 px de la paginación quedan por debajo.
22. No transmitir estado solo por color (estados de factura, semáforos): añadir texto o icono.
23. `userSelect: 'none'` (8 archivos): comprobar que no impide copiar datos que el usuario necesite.

## 3. Estado por componente grande
- **DataTableQuery / DataTable**: A1 (paginación), A2 (filas), roles ARIA ausentes, foco en celda editable, contraste de filas seleccionadas por verificar.
- **Diálogos (≈190)**: casi todos sin `aria-labelledby`.
- **Formularios de `pages/`**: la mayor parte de A1, A4, A5, A6 está aquí (228 de los ~310 botones sin nombre).
- **Login**: `href="#"`, errores y campos por verificar con lector de pantalla.
- **WhatsApp/chat**: botones de icono en `chat-room-*`, lista de mensajes sin `role="log"`/`aria-live`.

## 4. Lo que falta medir (necesita navegador)
- Lighthouse + **axe DevTools** en 6 pantallas (login, dashboard, un listado con DataTableQuery, un formulario, un diálogo, WhatsApp).
- Recorrido solo con teclado (Tab/Shift+Tab/Enter/Esc) en un flujo completo (crear factura).
- Un lector de pantalla (NVDA en Windows) en login y un listado.
- Contraste real de la paleta en ambos temas.

## 5. Plan sugerido
1. **Prevención**: instalar `eslint-plugin-jsx-a11y` (hoy no está) en modo `warn`, más una regla propia para `IconButton` sin nombre. Evita que el número crezca mientras se corrige.
2. **Fase 1 (compartidos, P1 + P5-18/19)**: DataTable, componentes de `components/`, foco global, reduced-motion. Mayor retorno por esfuerzo.
3. **Fase 2 (formularios y diálogos, P2 + A7)**: arreglos mecánicos; se pueden hacer por módulo (Ventas, Compras, Tesorería, Inventario…) con un codemod para los casos simples.
4. **Fase 3 (teclado y estructura, P3 + P4)**.
5. **Fase 4 (contraste y táctil, P5)** tras la medición con axe.
Cada fase en su rama, con `yarn build` y revisión visual antes de fusionar; los cambios son de atributos y semántica, no alteran el flujo del ERP.

## 7. Estado de la corrección (rama `claude/front-accesibilidad` del front)
Hecho (tsc 0 errores, `yarn build` ok, eslint 0 errores):
- A1: ~330 `IconButton` con `aria-label` (según icono/handler; los de mostrar/ocultar y expandir/contraer usan etiqueta dinámica). Botones dentro de `<Tooltip><span>` también.
- A2: ~85 elementos clicables con `role="button"`, `tabIndex={0}` y Enter/Espacio (`src/utils/a11y.ts`, `activateOnKey`); filas (`TableRow`) con `tabIndex` + teclado.
- A3: `alt` en todas las imágenes (decorativas con `alt=""`).
- A4–A6: `TextField`/`Select`/`Switch`/`Checkbox` con nombre (`aria-label` o `slotProps.htmlInput`).
- A7: MUI 7 enlaza `aria-labelledby` solo cuando hay `DialogTitle`; se añadió `aria-label` a los 10 diálogos sin título.
- A8/A10: foco visible en el dropzone de subida; se quitó el enlace "¿Olvidaste tu contraseña?" del login (`href="#"`, no existe ruta de recuperación de contraseña).
- Global: foco visible (`:focus-visible`), `prefers-reduced-motion`, "Saltar al contenido", `aria-current="page"` y `aria-label` en el menú, título de pestaña según la opción de menú activa, DataTable con `aria-selected`/`aria-rowcount`/`aria-busy`.
- Prevención: `eslint-plugin-jsx-a11y` + regla de `IconButton` sin nombre, en modo aviso.

Pendiente / revisar:
- Medir con axe, teclado y lector de pantalla (sección 4); contraste de color y tamaño táctil (P5) no se tocaron.
- Las celdas `TableCell` del gestor de archivos siguen con `onClick` solo de mouse (la acción está en su menú y casilla).
- `outline: none` se mantiene en el editor (ProseMirror), `EditableCell` y zonas con foco propio ya estilizado.
- Los `aria-label` de campos derivan del placeholder o del contexto: conviene revisar redacción con el equipo.
- Subir el lint a error (2) cuando queden 0 avisos.
