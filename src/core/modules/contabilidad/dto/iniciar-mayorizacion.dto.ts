import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

import { TIPO_ORIGEN_MAYORIZAR_VALUES, TipoOrigenMayorizar } from './log-mayorizacion.dto';

export const ACCION_MAYORIZAR_VALUES = ['GENERAR', 'ANULAR'] as const;
export type AccionMayorizar = (typeof ACCION_MAYORIZAR_VALUES)[number];

/** Documento a procesar. numero/persona/total solo se usan para mostrar el avance. */
export class DocumentoMayorizarDto {
    /** ide_cpcfa / ide_cccfa / ide_cpcno según el origen */
    @IsInt()
    id: number;

    @IsString()
    @IsOptional()
    numero?: string;

    @IsString()
    @IsOptional()
    persona?: string;

    @IsNumber()
    @IsOptional()
    total?: number;
}

/** "Generar / Anular asientos" de Mayorizar en segundo plano (ver MayorizacionProcesoService). */
export class IniciarMayorizacionDto {
    @IsIn(TIPO_ORIGEN_MAYORIZAR_VALUES)
    tipoOrigen: TipoOrigenMayorizar;

    @IsIn(ACCION_MAYORIZAR_VALUES)
    accion: AccionMayorizar;

    @IsInt()
    @Min(2000)
    periodo: number;

    @IsInt()
    @Min(1)
    @Max(12)
    mes: number;

    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => DocumentoMayorizarDto)
    documentos: DocumentoMayorizarDto[];
}
