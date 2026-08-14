import { Transform } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt } from 'class-validator';

/** Se envía junto al archivo XML como multipart/form-data - los ide_cctfa llegan como campo
 * de texto separado por comas (p.ej. "12,13,14"), no como JSON, porque el resto del form es
 * el binario del archivo. */
export class PrepararXmlFleteConsolidadoDto {
    @IsArray()
    @ArrayMinSize(1, { message: 'Debe seleccionar al menos un envío' })
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
