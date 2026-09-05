import { Type } from 'class-transformer';
import {
    IsArray,
    IsDateString,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Min,
    ValidateNested,
} from 'class-validator';

/** Mismo shape que EnvioFleteConsolidadoDto (crear-factura-flete-consolidada.dto) - se repite
 * acá en vez de importarlo para no acoplar este DTO "sin factura" al de creación de factura. */
export class EnvioGrupoFleteDto {
    @IsInt()
    @IsNotEmpty()
    ide_cctfa: number;

    @IsNumber()
    @Min(0)
    @IsNotEmpty()
    valor: number;

    @IsString()
    @IsOptional()
    observacion?: string;
}

/**
 * Registra el grupo de envíos SIN factura todavía (queda en estado "Pendiente Factura"): no
 * crea ninguna factura CxP ni pide forma de pago - solo reserva los envíos para que no
 * aparezcan disponibles en otro grupo, hasta que se complete con el XML del transportista o
 * asociando una factura ya existente (ver FleteConsolidadoController.completarConXml /
 * completarConFacturaExistente).
 */
export class RegistrarGrupoEnviosFleteDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => EnvioGrupoFleteDto)
    @IsNotEmpty()
    envios: EnvioGrupoFleteDto[];

    @IsDateString()
    @IsNotEmpty()
    fecha_desde: string;

    @IsDateString()
    @IsNotEmpty()
    fecha_hasta: string;
}
