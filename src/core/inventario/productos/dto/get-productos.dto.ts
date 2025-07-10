import { IsIn,  IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';


export class GetProductoDto extends QueryOptionsDto {

    @IsIn(['true']) // Solo permite estr valor
    @IsOptional()
    activos?: 'true' ;

}
