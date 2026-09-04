import { IsInt, IsString, IsOptional } from 'class-validator';

export class ProveedoresCxPDto {

    /** Tipo de documento CxP: condiciona el filtro de proveedores */
    @IsInt()
    @IsOptional()
    ide_cntdo?: number;

    /** Texto de búsqueda (nombre o identificación) — autocomplete tipo SearchCliente */
    @IsString()
    @IsOptional()
    value?: string;

    @IsInt()
    @IsOptional()
    limit?: number;
}
