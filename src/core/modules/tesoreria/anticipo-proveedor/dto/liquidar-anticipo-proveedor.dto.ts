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

/** Liquida (aplica) un anticipo contra una o varias facturas del mismo proveedor. Si es una
 * sola factura por el saldo completo, se resuelve directo con cxp_cabece_transa.ide_cpcfa (ver
 * DocumentosCxPSaveService.resolverCabeceraTransaccion, ide_cpctr_anticipo) - este endpoint es
 * para el caso que ese mecanismo no soporta: varias facturas o aplicación parcial, registrado
 * en cxp_aplicacion_anticipo (una fila por factura, con su propio asiento de reclasificación). */
export class LiquidarAnticipoProveedorDto {
    /** FK → cxp_cabece_transa (el anticipo) */
    @IsInt()
    @IsNotEmpty()
    ide_cpctr: number;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AplicacionAnticipoDto)
    @IsNotEmpty()
    aplicaciones: AplicacionAnticipoDto[];
}
