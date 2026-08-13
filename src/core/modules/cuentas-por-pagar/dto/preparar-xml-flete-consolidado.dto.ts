import { Transform } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt } from 'class-validator';

/** Se envía junto al archivo XML como multipart/form-data - los ide_cctfa llegan como campo
 * de texto separado por comas (p.ej. "12,13,14"), no como JSON, porque el resto del form es
 * el binario del archivo. */
export class PrepararXmlFleteConsolidadoDto {
    @IsArray()
    @ArrayMinSize(2, { message: 'Debe seleccionar al menos 2 envíos para consolidar en una factura' })
    @IsInt({ each: true })
    @Transform(({ value }) =>
        Array.isArray(value)
            ? value.map(Number)
            : String(value)
                .split(',')
                .map((v) => Number(v.trim()))
                .filter((v) => !Number.isNaN(v)),
    )
    ideCctfas: number[];
}
