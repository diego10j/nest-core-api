import { IsInt, IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

/** DTO para búsquedas que requieren filtrar por tipo de cuenta */
export class GetCuentasPorTipoDto extends QueryOptionsDto {
    @IsInt()
    @IsOptional()
    ide_cntcu?: number;
}

/** DTO para búsqueda de cuentas que pertenezcan a un plan específico */
export class GetDetPlanCuentaDto extends QueryOptionsDto {
    @IsInt()
    @IsOptional()
    ide_cncpc?: number;
}
