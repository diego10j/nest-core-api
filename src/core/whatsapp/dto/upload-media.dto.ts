import { IsInt, IsNotEmpty, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class UploadMediaDto {

    @IsString()
    @IsOptional()
    caption?: string;



    @IsString()
    @IsNotEmpty()
    @Matches(
        /^\d{12}$/g, {
        message: 'Número de teléfono no válido'
    })
    telefono: string;
    

    @IsString()
    fileType: string;

    @IsString()
    fileName: string;


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
