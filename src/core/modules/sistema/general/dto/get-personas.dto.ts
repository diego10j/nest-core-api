import { IsIn, IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class GetPersonasDto extends QueryOptionsDto {
    @IsIn(['true', 'false'])
    @IsOptional()
    esCliente?: 'true' | 'false';

    @IsIn(['true', 'false'])
    @IsOptional()
    esProveedor?: 'true' | 'false';

    @IsIn(['true', 'false'])
    @IsOptional()
    esEmpleado?: 'true' | 'false';

    @IsIn(['true', 'false'])
    @IsOptional()
    activo?: 'true' | 'false';
}
