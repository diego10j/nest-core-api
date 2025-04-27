import { IsNotEmpty, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class UploadMediaDto {



    @IsString()
    @IsNotEmpty()
    @Matches(
        /^\d{12}$/g, {
        message: 'Número de teléfono no válido'
    })
    telefono: string;


    @IsString()
    @IsOptional()
    caption?: string;


    @IsString()
    @IsOptional()
    type?: string | 'image' | 'video' | 'document' | 'audio' | 'sticker';


    @IsString()
    @IsOptional()
    fileName?: string;

    @IsString()
    ideUsua: string;

    @IsString()
    ideEmpr: string;

    @IsString()
    ideSucu: string;

    @IsString()
    @MinLength(4)
    login: string;

}
