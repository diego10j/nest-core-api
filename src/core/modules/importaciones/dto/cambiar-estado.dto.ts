import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class CambiarEstadoDto {

    @IsInt()
    ide_imcaim: number;

    @IsInt()
    ide_imesor_nuevo: number;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    observacion?: string;
}
