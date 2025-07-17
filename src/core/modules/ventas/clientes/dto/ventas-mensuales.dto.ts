import { IsInt, IsPositive } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class VentasMensualesClienteDto extends QueryOptionsDto {


    @IsInt()
    @IsPositive()
    ide_geper: number;

    @IsInt()
    @IsPositive()
    periodo: number;

}
