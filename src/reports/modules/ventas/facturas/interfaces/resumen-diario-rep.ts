export interface ResumenDiarioRep {
    fecha: string;
    metricas: MetricasResumenDiario;
    graficas: {
        por_estado_sri: EstadoSriItem[];
        por_forma_pago: FormaPagoItem[];
        por_hora: VentaPorHoraItem[];
        top_clientes: TopClienteItem[];
        top_articulos: TopArticuloItem[];
    };
    facturas: FacturaResumenItem[];
}

export interface MetricasResumenDiario {
    total_facturas: number;
    total_facturado: number;
    ticket_promedio: number;
    facturas_credito: number;
    facturas_contado: number;
    total_credito: number;
    total_contado: number;
    total_cobrado: number;
    total_retenciones: number;
    total_pendiente: number;
    facturas_con_retencion: number;
    facturas_anuladas: number;
}

export interface EstadoSriItem {
    nombre: string;
    color: string;
    icono: string;
    cantidad: number;
    total: number;
}

export interface FormaPagoItem {
    nombre: string;
    cantidad: number;
    total: number;
}

export interface VentaPorHoraItem {
    hora: number;
    etiqueta: string;
    cantidad: number;
    total: number;
}

export interface TopClienteItem {
    nom_geper: string;
    identificac_geper: string;
    uuid: string;
    cantidad_facturas: number;
    total: number;
}

export interface TopArticuloItem {
    codigo_inarti: string;
    nombre_inarti: string;
    uuid_inarti: string;
    siglas_inuni: string;
    cantidad_vendida: number;
    total: number;
}

export interface FacturaResumenItem {
    ide_cccfa: number;
    ide_ccdaf: number;
    secuencial_cccfa: string;
    establecimiento_ccdfa: string;
    pto_emision_ccdfa: string;
    nom_geper: string;
    identificac_geper: string;
    uuid_geper: string;
    total_cccfa: number;
    dias_credito_cccfa: number;
    observacion_cccfa?: string;
    nombre_sresc?: string;
    color_sresc?: string;
    icono_sresc?: string;
    nombre_vgven?: string;
    nombre_cndfp?: string;
    claveacceso_srcom?: string;
    hora_ingre?: string;
    total_pagado: number;
    total_retencion: number;
    saldo: number;
    estado_pago: string;
    color_estado: string;
}
