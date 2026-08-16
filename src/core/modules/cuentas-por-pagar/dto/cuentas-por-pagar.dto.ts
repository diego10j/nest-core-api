import { IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class CuentasPorPagarDto extends QueryOptionsDto {
    @IsDateString()
    fechaInicio: string;

    @IsDateString()
    fechaFin: string;

    @IsIn(['true']) // Solo permite estr valor
    @IsOptional()
    activos?: 'true';

    /** FK → gen_persona: filtra las cuentas por pagar de un proveedor */
    @IsInt()
    @IsOptional()
    ide_geper?: number;
}

/**
 * Cuentas por pagar pendientes (saldo > 0) de un proveedor. El rango de fechas es opcional
 * (filtra por fecha de emisión de la factura) - si no se envía, se listan TODAS las
 * obligaciones vigentes del proveedor, igual que antes. Hereda las opciones de
 * paginación/orden/filtro para integrarse con DataTableQuery.
 */
export class GetCuentasPorPagarProveedorPendientesDto extends QueryOptionsDto {
    /** FK → gen_persona: proveedor del que se listan las obligaciones pendientes */
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
