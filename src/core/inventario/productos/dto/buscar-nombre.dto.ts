import { IsInt, IsOptional, IsString } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class BusquedaPorNombreDto extends QueryOptionsDto {

    @IsString()
    nombre: string;

    @IsInt()
    @IsOptional()
    limit?: number = 25;

}
