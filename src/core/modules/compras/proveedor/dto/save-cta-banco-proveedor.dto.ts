import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SaveCtaBancoProveedorDto {
    @IsInt()
    @IsOptional()
    ideCpcbp?: number;

    @IsInt()
    @IsNotEmpty()
    ideGeper: number;

    @IsInt()
    @IsOptional()
    ideTeban?: number;

    @IsInt()
    @IsOptional()
    ideTetcb?: number;

    @IsString()
    @IsOptional()
    numeroCpcbp?: string;

    @IsString()
    @IsOptional()
    nombreCpcbp?: string;

    @IsString()
    @IsOptional()
    observacionCpcbp?: string;

    @IsBoolean()
    @IsOptional()
    activoCpcbp?: boolean;

    @IsBoolean()
    @IsOptional()
    defectoCpcbp?: boolean;
}
