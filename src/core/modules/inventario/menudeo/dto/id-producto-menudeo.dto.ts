import { IsInt, IsOptional, IsPositive } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

/** DTO reutilizable para las consultas de menudeo que reciben ide_inarti */
export class IdProductoMenudeoDto extends QueryOptionsDto {
    @IsInt()
    @IsOptional()
    ide_inarti?: number;
}
