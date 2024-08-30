import { IsString, Length } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';

export class CedulaDto extends ServiceDto {

    @IsString()
    @Length(10, 10, { message: 'La cédula debe tener 10 caracteres.' })
    cedula: string;

}
