import { IsInt, IsOptional, IsUUID } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class PerfilUsuarioDto extends QueryOptionsDto {
    @IsInt()
    @IsOptional()
    ide_sist?: number = 2;

    @IsInt()
    @IsOptional()
    ide_usua?: number;

    @IsUUID()
    @IsOptional()
    uuid?: string;

}
