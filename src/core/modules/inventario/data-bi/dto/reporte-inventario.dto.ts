import { IsInt, IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class ReporteInventarioDto extends QueryOptionsDto {

    @IsInt()
    periodo: number;
}
