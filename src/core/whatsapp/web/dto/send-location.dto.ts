import { IsInt, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';


export class SendLocationDto extends ServiceDto {

    @IsString()
    @IsNotEmpty()
    @Matches(
        /^\d{12}$/g, {
        message: 'Número de teléfono no válido'
    })
    telefono: string;

    @IsInt()
    latitude: number;

    @IsInt()
    longitude: number;

    @IsString()
    @IsOptional()
    name?: string;

    @IsString()
    @IsOptional()
    address?: string;

}
