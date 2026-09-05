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

import { CabDocumentoCxPDto, DetalleDocumentoCxPDto } from './save-documento-cxp.dto';

/** Un envío incluido en la factura consolidada, con el valor final que le corresponde (el
 * emparejamiento propuesto por GPT, o el que el usuario reasignó a mano en el visualizador). */
export class EnvioFleteConsolidadoDto {
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

export class CrearFacturaFleteConsolidadaDto {
    @ValidateNested()
    @Type(() => CabDocumentoCxPDto)
    @IsNotEmpty()
    cabecera: CabDocumentoCxPDto;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DetalleDocumentoCxPDto)
    @IsNotEmpty()
    detalles: DetalleDocumentoCxPDto[];

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => EnvioFleteConsolidadoDto)
    @IsNotEmpty()
    envios: EnvioFleteConsolidadoDto[];

    @IsDateString()
    @IsNotEmpty()
    fecha_desde: string;

    @IsDateString()
    @IsNotEmpty()
    fecha_hasta: string;

    /** FK → cxp_cab_flete_cons - si viene, completa ese grupo "Pendiente Factura" ya existente
     * (creado por registrarGrupoEnviosSinFactura) en vez de crear un grupo nuevo: actualiza su
     * cabecera/detalle en vez de insertar filas nuevas. */
    @IsInt()
    @IsOptional()
    ide_cpcfc?: number;

    /** FK → cxp_cabece_transa (anticipo ya pagado a este proveedor, sin documento asociado) -
     * se reenvía tal cual a DocumentosCxPSaveService.saveDocumento, que ya sabe reutilizar esa
     * cabecera en vez de crear un pago nuevo. */
    @IsInt()
    @IsOptional()
    ide_cpctr_anticipo?: number;
}
