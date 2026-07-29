import { IsInt, IsOptional } from 'class-validator';

export class SustentoTributarioCxPDto {

    /** Tipo de documento CxP: filtra los sustentos válidos según Tabla 4 SRI (ATS) */
    @IsInt()
    @IsOptional()
    ide_cntdo?: number;
}
