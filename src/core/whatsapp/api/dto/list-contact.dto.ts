import { IsArray, IsNotEmpty, IsString, Matches } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';

export class ListContactDto extends ServiceDto {

    @IsString()
    @IsNotEmpty()
    @Matches(
        /^\d{12}$/g, {
        message: 'Número de teléfono no válido'
    })
    telefono: string;

    @IsArray()
    listas: number[];

}
