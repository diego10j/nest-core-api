import { IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class SaveComprobanteBancoDto {
    @IsInt()
    @IsOptional()
    ideTeincb?: number;

    @IsInt()
    @IsOptional()
    ideTeclb?: number;

    @IsString()
    @IsOptional()
    fotoTeincb?: string;

    @IsIn(['enviada', 'recibida'])
    @IsOptional()
    tipoTrnsTeincb?: string;

    @IsNumber()
    @Min(0)
    @IsOptional()
    valorTeincb?: number;

    @IsString()
    @IsOptional()
    numComprobanteTeincb?: string;

    @IsDateString()
    @IsOptional()
    fechaTeincb?: string;

    @IsString()
    @IsOptional()
    ordenanteTeincb?: string;

    @IsString()
    @IsOptional()
    cuentaOrigenTeincb?: string;

    @IsString()
    @IsOptional()
    bancoOrigenTeincb?: string;

    @IsString()
    @IsOptional()
    beneficiarioTeincb?: string;

    @IsString()
    @IsOptional()
    cuentaDestinoTeincb?: string;

    @IsString()
    @IsOptional()
    bancoDestinoTeincb?: string;

    @IsString()
    @IsOptional()
    textoOriginalTeincb?: string;

    @IsBoolean()
    @IsOptional()
    porOcrTeincb?: boolean;

    @IsBoolean()
    @IsOptional()
    porIaTeincb?: boolean;

    @IsBoolean()
    @IsOptional()
    validadoTeincb?: boolean;

    @IsDateString()
    @IsOptional()
    fechaValidacionTeincb?: string;

    @IsBoolean()
    @IsOptional()
    activoTeincb?: boolean;
}
