import {  IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';


export class EnviarMensajeDto extends ServiceDto {

    @IsString()
    @IsNotEmpty()
    @Matches(
        /^\d{12}$/g, {
        message: 'Número de teléfono no válido'
    })
    telefono: string;


    @IsString()
    texto: string;


    // API

    @IsString()
    @IsNotEmpty()
    @IsOptional()
    tipo: string | 'text' | 'image' | 'audio' | 'video' | 'document' | 'location' | 'contacts' | 'sticker' = 'text';


    @IsString()
    @IsOptional()
    idWts?: string;

    @IsString()
    @IsOptional()
    mediaId?: string;

    @IsString()
    @IsOptional()
    fileName?: string;

    @IsString()
    @IsOptional()
    mimeType?: string;

}
