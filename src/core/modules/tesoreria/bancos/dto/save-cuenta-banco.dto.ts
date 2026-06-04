import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SaveCuentaBancoDto {
    @IsInt()
    @IsOptional()
    ideTecba?: number;

    @IsInt()
    @IsOptional()
    ideTetcb?: number;

    @IsInt()
    @IsNotEmpty()
    ideTeban: number;

    @IsInt()
    @IsOptional()
    ideCndpc?: number;

    @IsString()
    @IsNotEmpty()
    nombreTecba: string;

    @IsString()
    @IsOptional()
    observacionTecba?: string;

    @IsBoolean()
    @IsOptional()
    hacePagosTecba?: boolean;

    @IsBoolean()
    @IsOptional()
    haceChequeTecba?: boolean;

    @IsBoolean()
    @IsOptional()
    activoTecba?: boolean;
}
