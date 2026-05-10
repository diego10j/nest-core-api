import { Type } from 'class-transformer';
import {
    ArrayMinSize,
    IsArray,
    IsBoolean,
    IsDateString,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsObject,
    IsOptional,
    IsString,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { SaveDto } from 'src/common/dto/save.dto';

// ─────────────────────────────────────────────────────────────────────────────
// DETALLE DE FACTURA
// ─────────────────────────────────────────────────────────────────────────────

export class DetaFacturaDto {
    @ApiProperty({ description: 'ID del artículo (inv_articulo.ide_inarti)' })
    @IsInt()
    ide_inarti: number;

    @ApiProperty({ description: 'Cantidad vendida. Mínimo: 0.001', minimum: 0.001 })
    @IsNumber()
    @Min(0.001)
    cantidad_ccdfa: number;

    @ApiProperty({ description: 'Precio unitario. Mínimo: 0', minimum: 0 })
    @IsNumber()
    @Min(0)
    precio_ccdfa: number;

    @ApiProperty({ description: 'Total de la línea (cantidad × precio). Mínimo: 0', minimum: 0 })
    @IsNumber()
    @Min(0)
    total_ccdfa: number;

    @ApiProperty({
        description: 'Indicador de IVA. 0 = tarifa 0% / no objeto, valores > 0 = graba IVA',
    })
    @IsInt()
    iva_inarti_ccdfa: number;

    @ApiPropertyOptional({ description: 'Aplica crédito tributario. Default: false' })
    @IsBoolean()
    @IsOptional()
    credito_tributario_ccdfa?: boolean = false;

    @ApiPropertyOptional({ description: 'Descripción / observación del ítem. Máx. 150 caracteres', maxLength: 150 })
    @IsString()
    @IsOptional()
    @MaxLength(150)
    observacion_ccdfa?: string;

    @ApiPropertyOptional({ description: 'ID de la unidad de medida (inv_unidad.ide_inuni)' })
    @IsInt()
    @IsOptional()
    ide_inuni?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// GUÍA DE REMISIÓN
// Genera un registro en cxc_guia vinculado a la factura.
// Opcional: si no se envía, no se crea guía.
// ─────────────────────────────────────────────────────────────────────────────

export class GuiaRemisionDto {
    @ApiProperty({ description: 'Tipo de guía (cxc_tipo_guia.ide_cctgi)' })
    @IsInt()
    ide_cctgi: number;

    @ApiProperty({ description: 'Dirección de punto de partida. Máx. 250 caracteres', maxLength: 250 })
    @IsString()
    @MaxLength(250)
    punto_partida_ccgui: string;

    @ApiProperty({ description: 'Dirección de punto de llegada. Máx. 250 caracteres', maxLength: 250 })
    @IsString()
    @MaxLength(250)
    punto_llegada_ccgui: string;

    @ApiProperty({ description: 'Fecha de inicio del traslado (YYYY-MM-DD)' })
    @IsDateString()
    fecha_ini_trasla_ccgui: string;

    @ApiPropertyOptional({ description: 'Fecha de fin del traslado (YYYY-MM-DD). Default: misma fecha de inicio' })
    @IsDateString()
    @IsOptional()
    fecha_fin_trasla_ccgui?: string;

    @ApiPropertyOptional({
        description: 'Nombre del destinatario. Máx. 190 caracteres. Default: nombre del cliente',
        maxLength: 190,
    })
    @IsString()
    @IsOptional()
    @MaxLength(190)
    destinatario_ccgui?: string;

    @ApiPropertyOptional({
        description: 'Placa del vehículo de transporte (gen_camion.placa_gecam). Máx. 15 caracteres',
        maxLength: 15,
    })
    @IsString()
    @IsOptional()
    @MaxLength(15)
    placa_gecam?: string;

    @ApiPropertyOptional({
        description: 'ID de la persona transportista (gen_persona.ide_geper)',
    })
    @IsInt()
    @IsOptional()
    gen_ide_geper?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// CABECERA DE FACTURA
// ─────────────────────────────────────────────────────────────────────────────

export class CabeceraFacturaDataDto {
    @ApiPropertyOptional({ description: 'ID de la factura. Omitir para crear, requerido para actualizar' })
    @IsInt()
    @IsOptional()
    @Type(() => Number)
    ide_cccfa?: number;

    @ApiProperty({ description: 'ID del punto de emisión (cxc_datos_fac.ide_ccdaf)' })
    @IsInt()
    @Type(() => Number)
    ide_ccdaf: number;

    @ApiProperty({ description: 'ID del cliente (gen_persona.ide_geper)' })
    @IsInt()
    @Type(() => Number)
    ide_geper: number;

    @ApiProperty({ description: 'Fecha de emisión de la factura (YYYY-MM-DD)' })
    @IsDateString()
    fecha_emisi_cccfa: string;

    @ApiPropertyOptional({ description: 'ID del vendedor (ven_vendedor.ide_vgven)' })
    @IsInt()
    @IsOptional()
    @Type(() => Number)
    ide_vgven?: number;

    @ApiPropertyOptional({ description: 'ID de la forma de pago (con_deta_forma_pago.ide_cndfp)' })
    @IsInt()
    @IsOptional()
    @Type(() => Number)
    ide_cndfp1?: number;

    @ApiPropertyOptional({ description: 'Días de crédito. Default: 0 (contado)', default: 0 })
    @IsInt()
    @IsOptional()
    @Type(() => Number)
    dias_credito_cccfa?: number = 0;

    @ApiPropertyOptional({ description: 'Dirección de entrega. Máx. 180 caracteres', maxLength: 180 })
    @IsString()
    @IsOptional()
    @MaxLength(180)
    direccion_cccfa?: string;

    @ApiPropertyOptional({ description: 'Correo electrónico del cliente para envío. Máx. 100 caracteres', maxLength: 100 })
    @IsString()
    @IsOptional()
    @MaxLength(100)
    correo_cccfa?: string;

    @ApiPropertyOptional({ description: 'Observaciones de la factura' })
    @IsString()
    @IsOptional()
    observacion_cccfa?: string;

    @ApiPropertyOptional({
        description: 'Tarifa de IVA personalizada en porcentaje (ej: 15). Default: 15%',
        default: 15,
        minimum: 0,
    })
    @IsNumber()
    @IsOptional()
    @Min(0)
    @Type(() => Number)
    tarifa_iva_cccfa?: number;

    @ApiPropertyOptional({ description: 'Número de orden de compra del cliente. Máx. 50 caracteres', maxLength: 50 })
    @IsString()
    @IsOptional()
    @MaxLength(50)
    orden_compra_cccfa?: string;

    // ── Campos internos: el servicio los asigna, no enviar desde el frontend ──
    /** @internal Asignado automáticamente por el servicio */
    ide_cntdo?: number;
    /** @internal Asignado automáticamente por el servicio */
    ide_ccefa?: number;
    /** @internal Asignado automáticamente por el servicio */
    ide_usua?: number;
    /** @internal Asignado automáticamente por el servicio */
    secuencial_cccfa?: string;
    /** @internal Asignado automáticamente por el servicio */
    ide_srcom?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// DTO PRINCIPAL: GUARDAR FACTURA
// Soporta crear (isUpdate=false) y actualizar (isUpdate=true + data.ide_cccfa).
// ─────────────────────────────────────────────────────────────────────────────

export class SaveFacturaDto extends SaveDto {
    @ApiProperty({
        description: 'Datos de la cabecera de la factura',
        type: () => CabeceraFacturaDataDto,
    })
    @IsObject()
    @IsNotEmpty()
    @ValidateNested()
    @Type(() => CabeceraFacturaDataDto)
    declare data: CabeceraFacturaDataDto;

    @ApiProperty({
        description: 'Líneas de detalle. Mínimo 1 ítem requerido',
        type: [DetaFacturaDto],
    })
    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => DetaFacturaDto)
    @IsNotEmpty()
    detalles: DetaFacturaDto[];

    @ApiPropertyOptional({
        description: 'Guía de remisión asociada. Si se omite, no se genera guía.',
        type: () => GuiaRemisionDto,
    })
    @IsOptional()
    @IsObject()
    @ValidateNested()
    @Type(() => GuiaRemisionDto)
    guia?: GuiaRemisionDto;
}
