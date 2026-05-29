import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class ActualizarVariableDto {
    @IsString()
    @IsNotEmpty()
    @Matches(/^\S*$/, { message: 'nom_para no debe contener espacios' })
    nom_para: string;

    @IsString()
    @IsNotEmpty()
    valor_para: string;
}
