import { IsNotEmpty, IsString, Matches } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';


export class SendMenssageDto extends ServiceDto {

    @IsString()
    @IsNotEmpty()
    @Matches(
        /^\d{12}$/g, {
        message: 'Número de teléfono no válido'
    })
    telefono: string;

    @IsString()
    mensaje: string;


}
