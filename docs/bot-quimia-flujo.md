# QuimIA — Bot Comercial WhatsApp DIQUIMEC

## Descripción
Asistente virtual comercial especializado en venta de materias primas y productos químicos. Diseñado para calificar leads, responder consultas informativas y generar cotizaciones automáticas vía WhatsApp usando YCloud como BSP.

---

## Flujo completo

```
Cliente escribe cualquier mensaje
        │
        ▼
[INICIO] → Guarda texto_inicial → Envía bienvenida
        │
        ▼
[ESPERANDO_CONFIRMACION]
  SI ──→ Clasifica texto_inicial (GPT)
  │        ├─ PRODUCTO ──────────────────────→ [PREGUNTA_ES_CLIENTE]
  │        ├─ UBICACION/HORARIO/ENVIO/CATALOGO → responde info → [ATENCION_LIBRE]
  │        └─ GENERAL ────────────────────────→ [ATENCION_LIBRE]
  NO ──→ Deriva a asesor
        │
        ▼
[ATENCION_LIBRE]
  Detecta intención:
  ├─ UBICACION  → responde dirección + mapa
  ├─ HORARIO    → responde horarios
  ├─ ENVIO      → responde info de envíos
  ├─ CATALOGO   → responde links catálogo
  ├─ PRODUCTO   → [PREGUNTA_ES_CLIENTE]
  └─ GENERAL    → GPT responde en contexto
        │
        ▼
[PREGUNTA_ES_CLIENTE]
  "¿Has comprado antes con nosotros?"
  SI ──→ [IDENTIFICACION]
  NO ──→ [DATOS_NUEVO_CLIENTE]
        │
        ├─ [IDENTIFICACION]
        │    Pide cédula/RUC → Busca en gen_persona
        │    Encontrado ──→ [SELECCION_PRODUCTOS]
        │    No encontrado → [DATOS_NUEVO_CLIENTE]
        │
        └─ [DATOS_NUEVO_CLIENTE]
             Pide nombre → Pide correo
             Listo ──→ [SELECCION_PRODUCTOS]
        │
        ▼
[SELECCION_PRODUCTOS]
  Cliente escribe nombre de producto:
  ├─ 0 resultados → pide reformular
  ├─ 1 resultado  → confirma → [ESPERANDO_CANTIDAD]
  └─ N resultados → muestra lista → [SELECCION_MULTIPLE]
  FIN → [CONFIRMACION_PRODUCTOS]
        │
        ├─ [SELECCION_MULTIPLE]
        │    Cliente elige número → [ESPERANDO_CANTIDAD]
        │
        └─ [ESPERANDO_CANTIDAD]
             Extrae cantidad → agrega producto
             → vuelve a [SELECCION_PRODUCTOS]
        │
        ▼
[CONFIRMACION_PRODUCTOS]
  Muestra resumen de productos
  SI  → [DATOS_ENVIO]
  NO  → reinicia [SELECCION_PRODUCTOS]
  ASESOR → deriva
        │
        ▼
[DATOS_ENVIO]  (3 pasos secuenciales)
  1. Dirección exacta
  2. Provincia
  3. Empresa de transporte preferida
  → [DATOS_PAGO]
        │
        ▼
[DATOS_PAGO]
  "¿Efectivo o tarjeta?"
  → "Espera un momento..."
        │
        ▼
[PROCESANDO PROFORMA]
  Por cada producto:
  ├─ Busca precio configurado (inv_conf_precios_articulo)
  ├─ Verifica si está en catálogo (inv_det_catalogo)
  └─ Calcula precio total (con IVA si aplica)

  ¿TODOS tienen precio + están en catálogo?
  ├─ SÍ → COTIZACIÓN AUTOMÁTICA
  │        • Asigna ide_usua=32, ide_vgven=3
  │        • Genera PDF
  │        • Envía PDF por WhatsApp
  │        • Mensaje de confirmación
  └─ NO → COTIZACIÓN PARCIAL/BORRADOR
           • Crea proforma borrador
           • Muestra productos con y sin precio
           • Notifica a asesor
           • Deriva a modo ASESOR
        │
        ▼
[FINALIZADO] / deriva a ASESOR
```

---

## Comandos especiales (cualquier estado)

| Comando | Acción |
|---------|--------|
| `SALIR` | Deriva inmediatamente a asesor con mensaje cordial |
| `ASESOR`, `AGENTE`, `HUMANO`, `PERSONA`, `VENDEDOR` | Deriva a asesor |
| `FIN`, `LISTO` | Finaliza selección de productos |

---

## Respuestas informativas hardcodeadas

### 📍 Ubicación
- Calles Jacinto Jijón y Caamaño & Paseo 7, Valle de los Chillos
- Referencia: Estadio del Independiente del Valle
- Link Google Maps incluido

### 🕒 Horarios
- Lunes a Viernes: 08:00 — 17:00
- Sábados: 09:00 — 13:00

### 🚚 Envíos
- Envíos a nivel nacional
- Transporte a elección del cliente

### 📦 Catálogo
- Catálogos por sector: https://diquimec.com.ec/catalogo
- Listado completo: https://diquimec.com.ec/product

---

## Configuración técnica

### Variables de estado (wha_bot_sesion.datos_sesion JSONB)
```typescript
{
  texto_inicial?: string        // mensaje que activó el bot
  cliente?: {
    ide_geper?: number          // PK en gen_persona (si es cliente)
    nombres: string
    correo: string
    es_cliente_registrado: boolean
    pendiente_campo?: 'nombres' | 'correo'
  }
  productos: [{
    ide_inarti: number
    nombre: string
    cantidad: number
    siglas_unidad: string
    precio_unitario?: number    // calculado si tiene precio
    precio_total?: number
    tiene_precio?: boolean
    en_catalogo?: boolean
  }]
  opciones_producto?: [...]     // cuando hay selección múltiple
  producto_pendiente?: {...}    // producto esperando cantidad
  envio?: {
    direccion?: string
    provincia?: string
    transporte?: string
    pendiente_campo?: 'direccion' | 'provincia' | 'transporte'
  }
  forma_pago?: 'cash' | 'credit'
  proforma_ide?: number
  proforma_secuencial?: string
}
```

### Constantes de cotización automática
```typescript
IDE_USUA_BOT      = 32   // Usuario bot asignado a proformas
IDE_VGVEN_DEFAULT = 3    // Vendedor por defecto
```

### Búsqueda de productos
- Tabla: `inv_articulo`
- Campos: `nombre_inarti`, `otro_nombre_inarti`
- Límite: 10 resultados
- Ordenamiento: coincidencia exacta primero

### Verificación de precio automático
- Tabla: `inv_conf_precios_articulo`
- Condición: `precio_fijo_incpa > 0` y cantidad mínima cumplida
- IVA: se aplica 12% si `incluye_iva_incpa = FALSE`

---

## Arquitectura de servicios

| Servicio | Responsabilidad |
|----------|----------------|
| `BotService` | Máquina de estados, orquestación |
| `BotConfigService` | Config bot desde wha_bot_config (Redis cache) |
| `BotSessionService` | Sesiones y estado en wha_bot_sesion |
| `BotToolsService` | Queries BD: clientes, productos, precios |
| `BotGptService` | OpenAI: clasificación de intenciones y respuestas |
| `BotProformaService` | Creación de proforma y cálculo de precios |
| `YcloudService` | Envío de mensajes y documentos vía YCloud |

---

## Mejoras sugeridas

### Corto plazo
1. **Template de saludo aprobado**: Reemplazar el mensaje de texto por el template oficial de WhatsApp Business cuando sea aprobado (pendiente en `handleInicio`).
2. **Botones interactivos**: Usar `sendInteractiveButtons` de YCloud para "Sí/No", "Efectivo/Tarjeta" — más UX que texto libre.
3. **Confirmación de pedido antes de proforma**: Mostrar resumen final completo (productos + envío + forma de pago) antes de generar el PDF.
4. **Manejo de paquetes/kits**: Si el cliente pide combos de productos frecuentes, detectar y ofrecer paquetes preconfigurados.

### Mediano plazo
5. **Precios en tiempo real**: Integrar verificación de stock en el flujo para informar disponibilidad inmediata.
6. **Historial de pedidos**: En clientes registrados, mostrar sus últimas cotizaciones para reorden rápido.
7. **Catálogo interactivo**: Enviar imágenes del producto al mostrar las opciones de selección múltiple.
8. **Notificaciones push**: Cuando el asesor actualiza el estado de la cotización, notificar al cliente por WhatsApp.
9. **GPT con RAG**: Alimentar el modelo con la base de conocimiento de productos (fichas técnicas, usos, aplicaciones) para respuestas más precisas.

### Largo plazo
10. **Integración con sistema de pedidos**: Cuando el cliente confirma y paga, generar automáticamente la orden de venta (no solo la proforma).
11. **Seguimiento post-venta**: Bot que consulta si recibió el pedido y solicita calificación de servicio.
12. **Multi-empresa/multi-cuenta**: El prompt_sistema y respuestas informativas podrían ser configurables por empresa desde el panel admin.
13. **Análisis de conversaciones**: Dashboard de métricas: tasa de conversión, productos más cotizados, abandono por estado.

---

## Notas de implementación

- **SALIR** en cualquier momento: el cliente siempre puede escribir SALIR para ser atendido por un asesor humano.
- **Reintentos**: Si el bot falla 3 veces consecutivas en un estado, deriva automáticamente a asesor.
- **Sesión**: Una sesión activa por chat. Al completarse o cancelarse, se cierra y la siguiente interacción inicia nueva sesión.
- **Cache Redis**: Config del bot (TTL 300s) y empresa (TTL 3600s) para minimizar queries a BD.
- **Cotización automática**: Solo se genera si TODOS los productos tienen precio configurado Y están en algún catálogo activo.
