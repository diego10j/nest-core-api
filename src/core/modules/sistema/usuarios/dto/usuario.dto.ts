import { IsUUID, IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';



export class UsuarioDto extends QueryOptionsDto {

    @IsUUID()
    @IsOptional()
    uuid?: string;


}