import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';


export class SendLocationDto extends ServiceDto {

    @IsString()
    @IsNotEmpty()
    @Matches(
        /^\d{12}$/g, {
        message: 'Número de teléfono no válido'
    })
    telefono: string;

    @IsNumber({ maxDecimalPlaces: 8 }, {
        message: 'latitude debe ser un número con hasta 8 decimales'
    })
    latitude: number;

    @IsNumber({ maxDecimalPlaces: 8 }, {
        message: 'longitude debe ser un número con hasta 8 decimales'
    })
    longitude: number;


    @IsString()
    @IsOptional()
    name?: string;

    @IsString()
    @IsOptional()
    address?: string;

}
