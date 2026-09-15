export interface ProductoSesion {
  ide_inarti: number;
  nombre: string;
  cantidad: number;
  // Texto literal que el cliente usó para la cantidad (ej. "6 canecas", "1 galón") cuando
  // `cantidad` viene de una conversión (caneca→kg, galón→litros, etc.) — se usa para
  // mostrarle al cliente lo que él mismo escribió en el resumen de la cotización, en vez
  // del número ya convertido que se guarda internamente en la proforma.
  cantidadTexto?: string | null;
  unidad?: string;
  siglas_unidad?: string;
  precio_unitario?: number;
  precio_total?: number;
  costo_promedio?: number | null;
  utilidad_ccdpr?: number | null;
  porcentaje_util_ccdpr?: number | null;
  tiene_precio?: boolean;
  en_catalogo?: boolean;
  uso_generico?: string;
}

export interface ClienteSesion {
  ide_geper?: number;
  identificacion?: string;
  nombres: string;
  correo: string;
  telefono?: string;
  direccion_registrada?: string;
  ide_getid?: number;
  ide_vgven?: number;
  es_cliente_registrado: boolean;
  pendiente_campo?: 'nombres';
}

export interface EnvioSesion {
  direccion?: string;
  provincia?: string;
  latitud?: number;
  longitud?: number;
  pendiente_campo?: 'confirmar_envio_guardado' | 'tipo_direccion' | 'direccion_texto' | 'esperar_ubicacion' | 'provincia';
}

export interface PendienteUso {
  ide_inarti: number;
  nombre: string;
  siglas_unidad: string;
  nombre_unidad: string;
  en_catalogo: boolean;
  cantidad_conocida: number | null;
}

export interface PendienteCantidad {
  ide_inarti: number;
  nombre: string;
  siglas_unidad: string;
  nombre_unidad: string;
  en_catalogo: boolean;
  uso_generico?: string;
}

// Un único match encontrado solo por los fallbacks difusos (reducción progresiva de
// palabras / búsqueda por palabras sueltas), NO por la búsqueda exacta inicial — no es
// confiable como para agregarlo directo (puede ser un falso positivo, ej. "Jabón de
// base de glicerina" reducido a "Jabón de" matcheando "MOLDE ... JABON DE MASAJES").
// Se pausa a confirmar con el cliente antes de continuar.
export interface PendienteConfirmacion {
  ide_inarti: number;
  nombre: string;
  siglas_unidad: string;
  nombre_unidad: string;
  en_catalogo: boolean;
  texto_original: string;
  cantidad_conocida: number | null;
}

export interface DatosSesion {
  texto_inicial?: string;
  // Texto YA clasificado como PRODUCTO que quedó en espera mientras el cliente
  // desconocido pasa por identificación (PREGUNTA_ES_CLIENTE → IDENTIFICACION /
  // DATOS_NUEVO_CLIENTE) — al terminar de identificarse se procesa automáticamente
  // en vez de pedirle que vuelva a escribir el producto.
  producto_texto_pendiente?: string;
  memoria_cargada?: boolean;  // indica que los datos del cliente vienen de sesión anterior
  cliente?: ClienteSesion;
  productos: ProductoSesion[];
  opciones_producto?: OpcionProducto[];
  envio?: EnvioSesion;
  forma_pago?: 'cash' | 'credit';
  // ─── Captura de productos en lote ──────────────────────────────────────
  texto_acumulado?: string;
  cola_productos?: { producto: string; cantidad: number | null }[];
  item_cantidad_conocida?: number | null;
  // Ítems que ya se resolvieron contra catálogo (o son genéricos sin match) y quedan
  // agrupados para preguntar "uso" o "cantidad" de todos juntos en un solo mensaje,
  // en vez de uno a la vez.
  pendientes_uso?: PendienteUso[];
  pendientes_cantidad?: PendienteCantidad[];
  // Ítem con un único match "dudoso" (solo por fallback difuso) a la espera de que el
  // cliente confirme si es o no el producto que buscaba — bloquea de inmediato.
  pendiente_confirmacion?: PendienteConfirmacion;
  // ─── Modo mensajes reducidos ────────────────────────────────────────────
  // TRUE luego de enviar el saludo inicial (una sola vez por sesión) — evita repetirlo
  // en cada mensaje mientras la sesión reducida siga abierta.
  saludo_reducido_enviado?: boolean;
  // Cuenta turnos procesados en la sesión reducida (se incrementa una vez por lote de
  // debounce). Pasado el límite sin concretar (ni cotización automática ni catálogo
  // resuelto), se deriva a un asesor humano en vez de seguir intentando indefinidamente.
  mensajes_reducido?: number;
  // Productos+cantidad detectados en el flujo simplificado (BotState.RECOPILANDO_
  // COTIZACION_RAPIDA) mientras se completan nombre/ciudad/cantidades faltantes.
  // Independiente de `productos` (que solo se llena al resolver contra el catálogo,
  // justo antes de llamar a procesarProforma).
  cotizacion_rapida?: {
    items: ItemCotizacionRapida[];
    // true cuando NINGÚN producto del lote matcheó con confianza en catálogo interno,
    // catálogo público, ni por palabras, NI con el registro de no-disponibles
    // (evaluarExistenciaProductos → SIN_MATCH) — puede tener otro nombre o conseguirse
    // con un proveedor aliado, así que el bot no asume "no lo vendemos"; se le pregunta
    // también el "uso" de cada uno para que el asesor tenga contexto real al completar
    // la cotización. Si el producto SÍ coincide con el registro de no-disponibles
    // (`wha_bot_no_disponible`), eso corta antes de llegar acá — ver evaluarExistencia
    // Productos → NO_VENDEMOS, que responde directo con la observación.
    pedirUso?: boolean;
    // true cuando ya se preguntó la ciudad como mensaje independiente (después de tener
    // cantidad/uso/nombre completos) — la siguiente respuesta del cliente se interpreta
    // como esa respuesta y se finaliza la cotización sin importar si trajo o no una
    // ciudad reconocible (no bloquea, solo se pregunta una vez).
    ciudadPreguntada?: boolean;
  };
}

export interface ItemCotizacionRapida {
  producto: string;
  cantidad: number | null;
  // Texto literal que el cliente usó para la cantidad (ver ProductoSesion.cantidadTexto).
  cantidadTexto?: string | null;
  // Para qué necesita el producto — solo se pide cuando `pedirUso` está activo (ver
  // arriba); se adjunta como `uso_generico` en la proforma para el asesor.
  uso?: string | null;
}

export interface OpcionProducto {
  numero: number;
  ide_inarti: number;
  nombre: string;
  otro_nombre?: string;
  matched_by_otro_nombre?: boolean;
  siglas_unidad: string;
  nombre_unidad: string;
  en_catalogo: boolean;
}
