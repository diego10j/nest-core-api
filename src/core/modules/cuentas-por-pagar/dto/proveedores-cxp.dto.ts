import { IsInt, IsOptional } from 'class-validator';

export class ProveedoresCxPDto {

    /** Tipo de documento CxP: condiciona el filtro de proveedores */
    @IsInt()
    @IsOptional()
    ide_cntdo?: number;
}
