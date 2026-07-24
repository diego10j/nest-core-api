import { IsIn, IsInt, IsNotEmpty, IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class GetCtaBancoProveedorDto extends QueryOptionsDto {
    @IsInt()
    @IsNotEmpty()
    ideGeper: number;

    @IsIn(['true', 'false'])
    @IsOptional()
    activo?: 'true' | 'false' = 'true';
}
