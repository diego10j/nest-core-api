export interface OrdenPagoCabecera {
    ide_cpcop: number;
    secuencial_cpcop: string;
    ide_cpeo: number;
    estado: string;
    color_cpeo: string;
    fecha_genera_cpcop: Date | string;
    fecha_pago_cpcop: Date | string | null;
    fecha_efectiva_pago_cpcop: Date | string | null;
    referencia_cpcop: string | null;
    activo_cpcop: boolean;
    ide_usua: number;
    nombre_usuario: string;
    ide_empr: number;
    ide_sucu: number;
}

export interface OrdenPagoDetalle {
    ide_cpcdop: number;
    ide_cpcop: number;
    ide_cpctr: number;
    ide_cpeo: number;
    estado_detalle: string;
    color_detalle: string;
    ide_cpcfa: number | null;
    numero_cpcfa: string | null;
    fecha_emisi_cpcfa: Date | string | null;
    total_cpcfa: number | null;
    dias_credito_cpcfa: number | null;
    fecha_vence: Date | string | null;
    ide_geper: number;
    nombre_proveedor: string;
    identificac_geper: string;
    identificacion_tipo: string | null;
    fecha_pago_cpcdop: Date | string | null;
    num_comprobante_cpcdop: string | null;
    valor_pagado_cpcdop: number;
    saldo_pendiente_cpcdop: number;
    documento_referencia_cpcdop: string | null;
    notifica_cpcdop: string | null;
    activo_cpcdop: boolean;
    valor_pagado_banco_cpcdop: number | null;
    fecha_cheque_cpcdop: Date | string | null;
    ide_tecba: number | null;
    nombre_banco: string | null;
    cuenta_banco: string | null;
    ide_tettb: number | null;
    tipo_transaccion_banco: string | null;
    observacion_cpcdop: string | null;
    foto_cpcdop: string | null;
}

export interface CuentaBancoProveedor {
    ide_cpcbp: number;
    ide_geper: number;
    nombre_cpcbp: string;
    numero_cpcbp: string;
    nombre_teban: string | null;
    nombre_tetcb: string | null;
}

export interface OrdenPagoGrupoProveedor {
    numPago: number;
    nombreProveedor: string;
    identificacion: string;
    facturas: string;
    valorTotal: number;
    cuentasBancarias: CuentaBancoProveedor[];
}

export interface OrdenPagoRep {
    cabecera: OrdenPagoCabecera;
    gruposProveedor: OrdenPagoGrupoProveedor[];
    totalGeneral: number;
}
