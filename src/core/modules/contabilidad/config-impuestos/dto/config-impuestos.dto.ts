import { Type } from 'class-transformer';
import {
    IsBoolean,
    IsDateString,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsObject,
    IsOptional,
    IsString,
    MaxLength,
    ValidateNested,
} from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { SaveDto } from 'src/common/dto/save.dto';

// ═════════════════════════════════════════════════════════════════════════
// con_impuesto — catálogo raíz (IVA / Renta)
// ═════════════════════════════════════════════════════════════════════════

export class ConImpuestoDataDto {
    @IsInt()
    @IsOptional()
    ide_cnimp?: number;

    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    nombre_cnimp: string;

    @IsString()
    @IsOptional()
    @MaxLength(20)
    codigo_fe_cnimp?: string;
}

export class SaveConImpuestoDto extends SaveDto {
    @IsObject()
    @IsNotEmpty()
    @ValidateNested()
    @Type(() => ConImpuestoDataDto)
    declare data: ConImpuestoDataDto;
}

// ═════════════════════════════════════════════════════════════════════════
// con_cabece_impues — casillero de retención (pertenece a un con_impuesto)
// ═════════════════════════════════════════════════════════════════════════

export class GetCabeceImpuesDto extends QueryOptionsDto {
    /** Filtra por impuesto padre (con_impuesto). Si se omite, trae todos los casilleros. */
    @IsInt()
    @IsOptional()
    ide_cnimp?: number;
}

export class CabeceImpuesDataDto {
    @IsInt()
    @IsOptional()
    ide_cncim?: number;

    @IsInt()
    @IsNotEmpty()
    ide_cnimp: number;

    @IsString()
    @IsNotEmpty()
    @MaxLength(150)
    nombre_cncim: string;

    @IsString()
    @IsOptional()
    @MaxLength(20)
    casillero_cncim?: string;

    @IsNumber()
    @IsOptional()
    valor_defecto_cncim?: number;

    @IsString()
    @IsOptional()
    @MaxLength(20)
    codigo_fe_retencion_cncim?: string;
}

export class SaveCabeceImpuesDto extends SaveDto {
    @IsObject()
    @IsNotEmpty()
    @ValidateNested()
    @Type(() => CabeceImpuesDataDto)
    declare data: CabeceImpuesDataDto;
}

// ═════════════════════════════════════════════════════════════════════════
// con_vigenc_impues — vigencia de un casillero (con_cabece_impues)
// ═════════════════════════════════════════════════════════════════════════

export class GetVigencImpuesDto extends QueryOptionsDto {
    @IsInt()
    @IsNotEmpty()
    ide_cncim: number;
}

export class VigencImpuesDataDto {
    @IsInt()
    @IsOptional()
    ide_cnvim?: number;

    @IsInt()
    @IsNotEmpty()
    ide_cncim: number;

    @IsString()
    @IsNotEmpty()
    @MaxLength(150)
    nombre_cnvim: string;

    @IsDateString()
    @IsNotEmpty()
    fecha_inici_cnvim: string;

    @IsDateString()
    @IsNotEmpty()
    fecha_final_cnvim: string;

    @IsBoolean()
    @IsOptional()
    estado_cnvim?: boolean;
}

export class SaveVigencImpuesDto extends SaveDto {
    @IsObject()
    @IsNotEmpty()
    @ValidateNested()
    @Type(() => VigencImpuesDataDto)
    declare data: VigencImpuesDataDto;
}

// ═════════════════════════════════════════════════════════════════════════
// con_detall_impues — % de retención por (vigencia, tipo documento, tipo contribuyente)
// Esta es la tabla que RetencionesCxPService.getPorcentajeImpuesto lee en producción.
// ═════════════════════════════════════════════════════════════════════════

export class GetDetallImpuesDto extends QueryOptionsDto {
    @IsInt()
    @IsNotEmpty()
    ide_cnvim: number;
}

export class DetallImpuesDataDto {
    @IsInt()
    @IsOptional()
    ide_cndim?: number;

    @IsInt()
    @IsNotEmpty()
    ide_cnvim: number;

    /** FK → con_tipo_document */
    @IsInt()
    @IsNotEmpty()
    ide_cntdo: number;

    /** FK → con_tipo_contribu */
    @IsInt()
    @IsNotEmpty()
    ide_cntco: number;

    @IsNumber()
    @IsNotEmpty()
    porcentaje_cndim: number;
}

export class SaveDetallImpuesDto extends SaveDto {
    @IsObject()
    @IsNotEmpty()
    @ValidateNested()
    @Type(() => DetallImpuesDataDto)
    declare data: DetallImpuesDataDto;
}

// ═════════════════════════════════════════════════════════════════════════
// con_tipo_contribu — catálogo de tipos de contribuyente (usado por gen_persona.ide_cntco)
// ═════════════════════════════════════════════════════════════════════════

export class TipoContribuDataDto {
    @IsInt()
    @IsOptional()
    ide_cntco?: number;

    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    nombre_cntco: string;

    @IsString()
    @IsOptional()
    @MaxLength(50)
    alter_tribu_cntco?: string;

    /** true = advertir antes de generar retención a proveedores/clientes de este tipo (ej. Contribuyente Especial / Grande Contribuyente SRI) */
    @IsBoolean()
    @IsOptional()
    no_retener_cntco?: boolean;
}

export class SaveTipoContribuDto extends SaveDto {
    @IsObject()
    @IsNotEmpty()
    @ValidateNested()
    @Type(() => TipoContribuDataDto)
    declare data: TipoContribuDataDto;
}
