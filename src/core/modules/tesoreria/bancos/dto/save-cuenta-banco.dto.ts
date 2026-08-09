import { IsBoolean, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

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

    // ── Configuración de comisión (sólo aplica a cuentas de bancos con es_tarjeta_teban) ────

    @IsNumber()
    @Min(0)
    @IsOptional()
    porcentajeComisionTecba?: number;

    @IsBoolean()
    @IsOptional()
    permiteDiferidoTecba?: boolean;

    @IsNumber()
    @Min(0)
    @IsOptional()
    porcentajeComisionDiferidoTecba?: number;

    @IsBoolean()
    @IsOptional()
    ivaComisionTecba?: boolean;

    @IsBoolean()
    @IsOptional()
    retieneIvaTecba?: boolean;

    @IsNumber()
    @Min(0)
    @IsOptional()
    porcentajeRetencionIvaTecba?: number;

    @IsBoolean()
    @IsOptional()
    retieneRentaTecba?: boolean;

    @IsNumber()
    @Min(0)
    @IsOptional()
    porcentajeRetencionRentaTecba?: number;
}
