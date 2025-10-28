import { IsInt, IsNumber, IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class AnalisisDto extends QueryOptionsDto {

    @IsInt()
    periodo: number;

    @IsNumber()
    @IsOptional()
    limit?: number;

    @IsNumber()
    @IsOptional()
    ide_inbod?: number;

    @IsNumber()
    @IsOptional()
    ide_inarti?: number;

}
