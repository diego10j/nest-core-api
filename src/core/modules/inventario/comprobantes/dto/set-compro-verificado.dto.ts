import { ArrayNotEmpty, IsArray, IsNotEmpty, IsString } from 'class-validator';

export class SetComporbantesVerificadosDto {

    @ArrayNotEmpty()
    @IsNotEmpty({ each: true })
    @IsArray()
    ide_incci: number[]; // Ahora es un array de IDs (ide_inec)

    @IsString()
    observacion?: string;

}
