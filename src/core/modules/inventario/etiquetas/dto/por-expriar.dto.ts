import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { IsOptional, IsString, IsIn } from 'class-validator';

export class PorExpirarDto extends QueryOptionsDto {

    @IsString()
    @IsIn(['3m', '6m', '9m', '12m', 'expiradas'])
    opcion: '3m' | '6m' | '9m' | '12m' | 'expiradas' = 'expiradas';

    @IsOptional()
    @IsString()
    tipo_ineta?: string;



}
