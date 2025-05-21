import { IsInt, IsOptional, IsPositive } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class VentasMensualesDto extends QueryOptionsDto {


    @IsInt()
    @IsPositive()
    ide_inarti: number;

    @IsInt()
    @IsPositive()
    periodo: number;


    @IsInt()
    @IsOptional()
    ide_geper?: number;

}
