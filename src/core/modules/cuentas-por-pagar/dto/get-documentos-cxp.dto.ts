import { IsIn, IsInt, IsOptional } from 'class-validator';
import { RangoFechasDto } from 'src/common/dto/rango-fechas.dto';

export class GetDocumentosCxPDto extends RangoFechasDto {

    @IsInt()
    @IsOptional()
    ide_cntdo?: number;

    /**
     * Solo liquidaciones de compra (tipo según p_con_tipo_documento_liquidacion_compra). La página de
     * Liquidaciones no puede sacar el ide_cntdo de getListDataTiposDocumento: ese combo las excluye a propósito.
     */
    @IsIn(['true'])
    @IsOptional()
    soloLiquidaciones?: 'true';
}
