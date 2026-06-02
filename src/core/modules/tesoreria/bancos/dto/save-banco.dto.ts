import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SaveBancoDto {
    @IsInt()
    @IsOptional()
    ideTeban?: number;

    @IsString()
    @IsNotEmpty()
    nombreTeban: string;

    @IsString()
    @IsOptional()
    contactoTeban?: string;

    @IsString()
    @IsOptional()
    telefonoTeban?: string;

    @IsString()
    @IsOptional()
    fotoTeban?: string;

    @IsString()
    @IsOptional()
    colorTeban?: string;
}
