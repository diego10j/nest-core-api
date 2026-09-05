import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNotEmpty, IsNumber, Min, ValidateNested } from 'class-validator';

export class AplicacionAnticipoDto {
    /** FK → cxp_cabece_factur (factura a la que se aplica parte o todo el anticipo) */
    @IsInt()
    @IsNotEmpty()
    ide_cpcfa: number;

    @IsNumber()
    @Min(0.01)
    @IsNotEmpty()
    valor: number;
}

/** Liquida (aplica) un anticipo contra una o varias facturas del mismo proveedor - cada una
 * genera su propio asiento de reclasificación (Debe Cuenta por Pagar del proveedor / Haber
 * Anticipo a Proveedores). El anticipo queda "Liquidado" cuando su saldo llega a cero, o
 * "Parcialmente Liquidado" si aún le queda saldo disponible. */
export class LiquidarAnticipoProveedorDto {
    /** FK → tes_cab_anticipo_prov */
    @IsInt()
    @IsNotEmpty()
    ide_teanp: number;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AplicacionAnticipoDto)
    @IsNotEmpty()
    aplicaciones: AplicacionAnticipoDto[];
}
