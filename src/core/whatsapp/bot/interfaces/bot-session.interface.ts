export interface ProductoSesion {
  ide_inarti: number;
  nombre: string;
  cantidad: number;
  unidad?: string;
  precio_referencia?: number;
}

export interface ClienteSesion {
  ide_geper?: number;
  identificacion?: string;
  nombres: string;
  correo: string;
  telefono?: string;
  es_cliente_registrado: boolean;
  pendiente_campo?: 'nombres' | 'correo';   // campo que el bot está esperando del cliente nuevo
}

export interface EnvioSesion {
  direccion?: string;
  provincia?: string;
  transporte?: string;
  envio_gratis?: boolean;
  pendiente_campo?: 'direccion' | 'provincia' | 'transporte';
}

export interface DatosSesion {
  cliente?: ClienteSesion;
  productos: ProductoSesion[];
  envio?: EnvioSesion;
  ultimo_producto_texto?: string;   // último texto del cliente sobre un producto (para contexto GPT)
  proforma_secuencial?: string;     // número de proforma generada al finalizar
}
