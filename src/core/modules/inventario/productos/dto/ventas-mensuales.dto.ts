import { IsInt, IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class VentasMensualesDto extends QueryOptionsDto {


    @IsInt()
    ide_inarti: number;

    @IsInt()
    periodo: number;


    @IsInt()
    @IsOptional()
    ide_geper?: number;

}
