import { IsDateString, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Filtro para listar los pagos (facturas de venta cobradas con una cuenta de tarjeta) que aún
 * tienen algo por registrar: su acreditación o su corte (ver
 * DevolucionCobroTarjetaService.getFacturasTarjetaPendientes).
 */
export class GetFacturasTarjetaPendientesDto {
    /** FK → tes_cuenta_banco (cuenta del procesador de tarjeta, ej. Bendo) */
    @IsInt()
    @IsNotEmpty()
    ideTecba: number;

    @IsDateString()
    @IsOptional()
    fechaDesde?: string;

    @IsDateString()
    @IsOptional()
    fechaHasta?: string;
}

/** Números de liquidación del procesador (separados por coma) a verificar antes de registrarlos */
export class GetLiquidacionesRegistradasDto {
    @IsString()
    @IsNotEmpty()
    numeros: string;
}
