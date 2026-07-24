import { IsDateString, IsIn, IsInt, IsOptional } from 'class-validator';
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
