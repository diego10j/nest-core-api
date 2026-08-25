import { IsDateString } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class ReporteRetencionesDto extends QueryOptionsDto {
    @IsDateString()
    fechaInicio: string;

    @IsDateString()
    fechaFin: string;
}

/**
 * Fila común de los reportes "Retenciones en Compras" / "Retenciones en Ventas"
 * (con_cabece_retenc), con el detalle desagregado en Renta e IVA (con_detall_retenc /
 * con_cabece_impues.ide_cnimp: 1 = renta, 0 = IVA) — igual desglose que usa el legacy
 * (ServicioRetenciones.getSqlRetencionesVentas) para los formularios 103/104 del SRI.
 */
export type RetencionRow = {
    ide_cncre: number;
    fecha: string;
    numero: string;
    autorizacion: string;
    nom_geper: string | null;
    identificac_geper: string | null;
    numero_documento: string | null;
    base_renta: number;
    ret_renta: number;
    base_iva: number;
    ret_iva: number;
    total_retenido: number;
    observacion: string | null;
    /** true si la retención está ligada a una devolución de cobro con tarjeta
     * (tes_cab_devol_cobro_tarjeta) — ej. retención de Bendo/procesador sobre el depósito. */
    es_pago_tarjeta: boolean;
};
