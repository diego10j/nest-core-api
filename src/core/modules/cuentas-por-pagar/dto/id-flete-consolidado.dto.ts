import { IsInt, IsNotEmpty } from 'class-validator';

export class IdFleteConsolidadoDto {
    @IsInt()
    @IsNotEmpty()
    ide_cpcfc: number;
}

export class MarcarPagadoFleteConsolidadoDto extends IdFleteConsolidadoDto {
    /** FK → tes_cab_libr_banc, el movimiento de pago recién registrado */
    @IsInt()
    @IsNotEmpty()
    ide_teclb: number;
}
