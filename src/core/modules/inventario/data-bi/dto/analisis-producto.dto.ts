import { IsInt, IsNumber, IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class AnalisisProductoDto extends QueryOptionsDto {

    @IsInt()
    periodo: number;

    @IsNumber()
    ide_inarti: number;

    @IsNumber()
    @IsOptional()
    limit?: number;

    @IsNumber()
    @IsOptional()
    ide_inbod?: number;

}
