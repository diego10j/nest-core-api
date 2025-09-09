interface Cabecera {
    numero_incci: number;
    fecha_trans_incci: Date;
    nombre_inbod: string;
    nombre_intti: string;
    nom_geper: string;
    observacion_incci: string;
    ide_cnccc: number;
    nombre_inepi: string;
    automatico_incci: boolean;
    usuario_ingre: string;
    fecha_ingre: Date;
    hora_ingre: string;
    verifica_incci: boolean;
    fecha_verifica_incci: Date;
    usuario_verifica_incci: string;
    signo_intci: number;
}

interface Detalle {
    nombre_inarti: string;
    precio_indci: number;
    valor_indci: number;
    observacion_indci: string;
    cantidad_indci: number;
    verifica_indci: boolean;
}


export interface ComprobanteInvRep {
    cabecera: Cabecera;
    detalles: Detalle[];
}