import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

export class SetActivoTransDto {
    @IsInt()
    @IsNotEmpty()
    ide: number;

    @IsBoolean()
    @IsNotEmpty()
    activo: boolean;
}

// ─── Tarifa individual (usado en el array del save completo) ──────

export class SaveTarifaItemDto {
    @IsInt()
    @IsOptional()
    ide_vgttr?: number;

    @IsInt()
    @IsNotEmpty()
    ide_geprov: number;

    @IsInt()
    @IsNotEmpty()
    ide_gecant: number;

    @IsString()
    @IsOptional()
    @MaxLength(100)
    ciudad_vgttr?: string;

    @IsString()
    @IsOptional()
    @MaxLength(100)
    nombre1_vgttr?: string;

    @IsOptional()
    precio1_vgttr?: number;

    @IsString()
    @IsOptional()
    @MaxLength(200)
    descripcion1_vgttr?: string;

    @IsOptional()
    activo1_vgttr?: boolean;

    @IsString()
    @IsOptional()
    @MaxLength(100)
    nombre2_vgttr?: string;

    @IsOptional()
    precio2_vgttr?: number;

    @IsString()
    @IsOptional()
    @MaxLength(200)
    descripcion2_vgttr?: string;

    @IsOptional()
    activo2_vgttr?: boolean;

    @IsString()
    @IsOptional()
    @MaxLength(100)
    nombre3_vgttr?: string;

    @IsOptional()
    precio3_vgttr?: number;

    @IsString()
    @IsOptional()
    @MaxLength(200)
    descripcion3_vgttr?: string;

    @IsOptional()
    activo3_vgttr?: boolean;

    @IsString()
    @IsOptional()
    @MaxLength(100)
    nombre4_vgttr?: string;

    @IsOptional()
    precio4_vgttr?: number;

    @IsString()
    @IsOptional()
    @MaxLength(200)
    descripcion4_vgttr?: string;

    @IsOptional()
    activo4_vgttr?: boolean;

    @IsString()
    @IsOptional()
    comentario_vgttr?: string;
}

// ─── Save completo: transporte + tarifas ─────────────────────────

export class SaveTransporteCompletoDto {
    @IsInt()
    @IsOptional()
    ide_vgtra?: number;

    @IsInt()
    @IsNotEmpty()
    ide_geper: number;

    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    nombre_vgtra: string;

    @IsString()
    @IsOptional()
    descripcion_vgtra?: string;

    @IsBoolean()
    @IsOptional()
    cobertura_nacional_vgtra?: boolean;

    @IsBoolean()
    @IsOptional()
    flete_cobro_vgtra?: boolean;

    @IsString()
    @IsOptional()
    @MaxLength(500)
    logo_vgtra?: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SaveTarifaItemDto)
    tarifas: SaveTarifaItemDto[];
}

export class SaveEnvioDto {
    @IsInt()
    @IsOptional()
    ide_cctfa?: number;

    @IsInt()
    @IsNotEmpty()
    ide_cccfa: number;

    @IsInt()
    @IsOptional()
    ide_vgtra?: number;

    @IsBoolean()
    @IsOptional()
    es_transporte_propio_cctfa?: boolean;

    @IsString()
    @IsOptional()
    @MaxLength(15)
    ide_gecam?: string;

    @IsInt()
    @IsOptional()
    ide_geper?: number;

    @IsInt()
    @IsNotEmpty()
    ide_cceen: number;

    @IsString()
    @IsOptional()
    fecha_inicio_cctfa?: string;

    @IsString()
    @IsOptional()
    fecha_fin_cctfa?: string;

    @IsString()
    @IsOptional()
    fecha_fin_real_cctfa?: string;

    @IsString()
    @IsOptional()
    path_imagen_guia_cctfa?: string;

    @IsOptional()
    base_flete_cctfa?: number;

    @IsOptional()
    valor_iva_flete_cctfa?: number;

    @IsOptional()
    total_flete_cctfa?: number;

    @IsOptional()
    base_flete_real_cctfa?: number;

    @IsOptional()
    valor_iva_flete_real_cctfa?: number;

    @IsOptional()
    total_flete_real_cctfa?: number;

    @IsBoolean()
    @IsOptional()
    flete_pagado_cctfa?: boolean;

    @IsString()
    @IsOptional()
    comentario_cctfa?: string;

    @IsBoolean()
    @IsOptional()
    enviar_por_correo_cctfa?: boolean;

    @IsString()
    @IsOptional()
    @MaxLength(200)
    correo_cctfa?: string;

    @IsString()
    @IsOptional()
    fecha_envio_cctfa?: string;
}

export class CompletarEnvioDto {
    @IsInt()
    @IsNotEmpty()
    ide_cctfa: number;

    @IsInt()
    @IsNotEmpty()
    ide_cceen: number;

    @IsString()
    @IsOptional()
    path_imagen_guia_cctfa?: string;

    @IsString()
    @IsOptional()
    fecha_fin_cctfa?: string;

    @IsString()
    @IsOptional()
    fecha_fin_real_cctfa?: string;

    @IsOptional()
    base_flete_real_cctfa?: number;

    @IsOptional()
    valor_iva_flete_real_cctfa?: number;

    @IsOptional()
    total_flete_real_cctfa?: number;

    @IsString()
    @IsOptional()
    comentario_cctfa?: string;

    @IsBoolean()
    @IsOptional()
    enviar_por_correo_cctfa?: boolean;

    @IsString()
    @IsOptional()
    @MaxLength(200)
    correo_cctfa?: string;

    @IsString()
    @IsOptional()
    fecha_envio_cctfa?: string;
}

export class SaveRutaDto {
    @IsInt()
    @IsOptional()
    ide_vgrta?: number;

    @IsInt()
    @IsNotEmpty()
    ide_gecam: number;

    @IsInt()
    @IsNotEmpty()
    ide_geper: number;

    @IsInt()
    @IsNotEmpty()
    ide_usua: number;

    @IsString()
    @IsNotEmpty()
    fecha_ruta_vgrta: string;

    @IsString()
    @IsOptional()
    @MaxLength(100)
    nombre_vgrta?: string;

    @IsOptional()
    latitud_inicio_vgrta?: number;

    @IsOptional()
    longitud_inicio_vgrta?: number;

    @IsString()
    @IsOptional()
    @MaxLength(300)
    direccion_inicio_vgrta?: string;

    @IsString()
    @IsOptional()
    comentario_vgrta?: string;
}

export class SaveRutaDetDto {
    @IsInt()
    @IsOptional()
    ide_vgrtd?: number;

    @IsInt()
    @IsNotEmpty()
    ide_vgrta: number;

    @IsInt()
    @IsNotEmpty()
    orden_vgrtd: number;

    @IsString()
    @IsOptional()
    @MaxLength(20)
    tipo_vgrtd?: string;

    @IsInt()
    @IsOptional()
    ide_cccfa?: number;

    @IsInt()
    @IsOptional()
    ide_cctfa?: number;

    @IsString()
    @IsNotEmpty()
    @MaxLength(300)
    descripcion_vgrtd: string;

    @IsOptional()
    latitud_vgrtd?: number;

    @IsOptional()
    longitud_vgrtd?: number;

    @IsString()
    @IsOptional()
    @MaxLength(300)
    direccion_vgrtd?: string;

    @IsBoolean()
    @IsOptional()
    realizado_vgrtd?: boolean;

    @IsString()
    @IsOptional()
    comentario_vgrtd?: string;
}
