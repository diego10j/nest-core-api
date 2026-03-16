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

export class DetaProformaDto {
    @IsInt()
    ide_inarti: number;

    @IsNumber()
    @Min(0.001)
    cantidad_ccdpr: number;

    @IsNumber()
    @Min(0)
    precio_ccdpr: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    total_ccdpr?: number;

    @IsInt()
    iva_inarti_ccdpr: number;

    @IsString()
    @IsOptional()
    @MaxLength(150)
    observacion_ccdpr?: string;

    @IsInt()
    @IsOptional()
    ide_inuni?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    precio_compra_ccdpr?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    porcentaje_util_ccdpr?: number;

    @IsNumber()
    @IsOptional()
    utilidad_ccdpr?: number;

    @IsNumber()
    @IsOptional()
    precio_sugerido_ccdpr?: number;
}

export class CabProformaDto {
    @IsInt()
    @IsOptional()
    ide_cccpr?: number;

    @IsDateString()
    fecha_cccpr: string;

    @IsString()
    @MaxLength(200)
    solicitante_cccpr: string;

    @IsString()
    @MaxLength(100)
    correo_cccpr: string;

    @IsInt()
    ide_cctpr: number;

    @IsInt()
    ide_usua: number;

    @IsNumber()
    @IsOptional()
    @Min(0)
    tarifa_iva_cccpr?: number;

    @IsString()
    @IsOptional()
    @MaxLength(200)
    observacion_cccpr?: string;

    @IsString()
    @IsOptional()
    @MaxLength(50)
    referencia_cccpr?: string;

    @IsInt()
    @IsOptional()
    ide_cndfp?: number;



    @IsString()
    @IsOptional()
    @MaxLength(50)
    telefono_cccpr?: string;

    @IsInt()
    @IsOptional()
    ide_getid?: number;

    @IsString()
    @IsOptional()
    @MaxLength(13)
    identificac_cccpr?: string;

    @IsInt()
    @IsOptional()
    ide_vgven?: number;

    @IsString()
    @IsOptional()
    @MaxLength(200)
    direccion_cccpr?: string;

    @IsString()
    @IsOptional()
    @MaxLength(100)
    contacto_cccpr?: string;

    @IsInt()
    @IsOptional()
    ide_ccten?: number;

    @IsInt()
    @IsOptional()
    ide_ccvap?: number;

    @IsInt()
    @IsOptional()
    ide_geprov?: number;


    @IsInt()
    @IsOptional()
    ide_geper?: number;

    @IsDateString()
    @IsOptional()
    fecha_abre_cccpr?: string;

    @IsString()
    @IsOptional()
    usuario_abre_cccpr?: string;


    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => DetaProformaDto)
    @IsNotEmpty()
    detalles: DetaProformaDto[];
}

export class SaveProformaDto {
    @IsBoolean()
    isUpdate: boolean;

    @IsNotEmpty()
    @IsObject()
    @ValidateNested()
    @Type(() => CabProformaDto)
    data: CabProformaDto;
}
