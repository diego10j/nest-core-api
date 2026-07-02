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

export interface DatosSesion {
  texto_inicial?: string;
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
  // Nombres de ítems del lote que no se encontraron en catálogo (no bloquea, se avisa
  // al final) — se acumula entre llamadas porque resolverColaProductos puede pausarse
  // varias veces (desambiguación, preguntas agrupadas) antes de llegar al final.
  no_encontrados?: string[];
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
