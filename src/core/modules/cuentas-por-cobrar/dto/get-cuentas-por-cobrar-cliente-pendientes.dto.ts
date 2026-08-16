import { IsDateString, IsInt, IsNotEmpty, IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

/**
 * Cuentas por cobrar pendientes (saldo > 0) de un cliente. El rango de fechas es opcional
 * (filtra por fecha de emisión de la factura) - si no se envía, se listan TODAS las
 * obligaciones vigentes del cliente. Hereda las opciones de paginación/orden/filtro para
 * integrarse con DataTableQuery - paridad con GetCuentasPorPagarProveedorPendientesDto.
 */
export class GetCuentasPorCobrarClientePendientesDto extends QueryOptionsDto {
    /** FK → gen_persona: cliente del que se listan las obligaciones pendientes */
    @IsInt()
    @IsNotEmpty()
    ide_geper: number;

    @IsDateString()
    @IsOptional()
    fechaInicio?: string;

    @IsDateString()
    @IsOptional()
    fechaFin?: string;
}
