import { IsBoolean, IsOptional } from 'class-validator';

export class PuntosEmisionLiquidacionDto {

    /** Filtra por punto de emisión electrónico (true) o físico/preimpreso (false,
     * cxc_datos_fac.es_electronica_ccdaf). Sin indicar, retorna ambos. */
    @IsOptional()
    @IsBoolean()
    electronica?: boolean;
}
