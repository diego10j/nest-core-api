export interface ProductoSesion {
  ide_inarti: number;
  nombre: string;
  cantidad: number;
  unidad?: string;
  siglas_unidad?: string;
  precio_unitario?: number;
  precio_total?: number;
  tiene_precio?: boolean;
  en_catalogo?: boolean;
}

export interface ClienteSesion {
  ide_geper?: number;
  identificacion?: string;
  nombres: string;
  correo: string;
  telefono?: string;
  direccion_registrada?: string;
  ide_getid?: number;
  es_cliente_registrado: boolean;
  pendiente_campo?: 'nombres' | 'correo';
}

export interface EnvioSesion {
  direccion?: string;
  provincia?: string;
  latitud?: number;
  longitud?: number;
  pendiente_campo?: 'usar_direccion_existente' | 'tipo_direccion' | 'direccion_texto' | 'esperar_ubicacion' | 'provincia';
}

export interface DatosSesion {
  texto_inicial?: string;
  cliente?: ClienteSesion;
  productos: ProductoSesion[];
  opciones_producto?: OpcionProducto[];
  producto_pendiente?: { ide_inarti: number; nombre: string; siglas_unidad: string; nombre_unidad: string; en_catalogo: boolean };
  envio?: EnvioSesion;
  forma_pago?: 'cash' | 'credit';
  proforma_ide?: number;
  proforma_secuencial?: string;
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
