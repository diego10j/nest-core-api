import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ValidateFirmaDto {
    @IsString()
    @IsNotEmpty()
    ruta_srfid: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(80)
    password_srfid: string;
}
