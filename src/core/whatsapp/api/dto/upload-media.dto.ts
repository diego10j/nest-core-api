import { IsNotEmpty, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class UploadMediaDto {

    @IsString()
    type: 'image' | 'video' | 'document' | 'audio' | 'sticker';

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


    // @IsString()
    // @IsOptional()
    // fileType?: string;

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
