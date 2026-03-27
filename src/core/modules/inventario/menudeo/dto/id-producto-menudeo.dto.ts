import { IsInt, IsPositive } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

/** DTO reutilizable para las consultas de menudeo que reciben ide_inarti */
export class IdProductoMenudeoDto extends QueryOptionsDto {
    @IsInt()
    @IsPositive()
    ide_inarti: number;
}
