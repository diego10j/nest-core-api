import { IsInt, IsOptional, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class TopCuentasPorPagarDto extends QueryOptionsDto {
    /** Número máximo de proveedores a retornar (default: 10, max: 100) */
    @IsInt()
    @IsOptional()
    @Min(1)
    @Max(100)
    @Type(() => Number)
    limit?: number = 10;
}
