import { IsUUID, IsOptional } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';



export class UsuarioDto extends ServiceDto {

    @IsUUID()
    @IsOptional()
    uuid?: string;


}