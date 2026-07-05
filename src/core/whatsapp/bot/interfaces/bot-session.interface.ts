export interface ProductoSesion {
  ide_inarti: number;
  nombre: string;
  cantidad: number;
  unidad?: string;
  siglas_unidad?: string;
  precio_unitario?: number;
  precio_total?: number;
  costo_promedio?: number | null;
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
  pendiente_campo?: 'nombres' | 'correo';
}

export interface EnvioSesion {
  direccion?: string;
  provincia?: string;
  latitud?: number;
  longitud?: number;
  pendiente_campo?: 'confirmar_envio_guardado' | 'usar_direccion_existente' | 'tipo_direccion' | 'direccion_texto' | 'esperar_ubicacion' | 'provincia';
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
  producto_pendiente?: {
    ide_inarti: number; nombre: string; siglas_unidad: string; nombre_unidad: string;
    en_catalogo: boolean; uso_generico?: string;
  };
  envio?: EnvioSesion;
  forma_pago?: 'cash' | 'credit';
  proforma_ide?: number;
  proforma_secuencial?: string;
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
