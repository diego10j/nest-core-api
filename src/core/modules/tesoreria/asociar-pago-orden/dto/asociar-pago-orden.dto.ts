import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsInt } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

/** Movimientos de Tesorería elegibles para completar el pago de un proveedor en una orden. */
export class GetMovimientosAsociablesDto extends QueryOptionsDto {
    @IsInt()
    ide_cpcop: number;

    /** FK → gen_persona (proveedor del grupo de detalles de la orden) */
    @IsInt()
    ide_geper: number;
}

/** Asocia movimientos (tes_cab_libr_banc) al pago pendiente de un proveedor en una orden. */
export class AsociarPagosOrdenDto {
    @IsInt()
    ide_cpcop: number;

    @IsInt()
    ide_geper: number;

    @IsArray()
    @ArrayNotEmpty()
    @ArrayMaxSize(20)
    @IsInt({ each: true })
    ide_teclb: number[];
}

/** Quita los pagos asociados de un proveedor en una orden (vuelve a pendiente). */
export class DesasociarPagosOrdenDto {
    @IsInt()
    ide_cpcop: number;

    @IsInt()
    ide_geper: number;
}
