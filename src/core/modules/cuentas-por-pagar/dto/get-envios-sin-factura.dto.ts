import { IsDateString, IsInt, IsNotEmpty } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

/** Envíos de un transportista, sin factura de flete registrada, en un rango de fechas
 * (según la fecha de emisión de la factura de venta, mismo criterio que el Reporte de Envío
 * de Facturas) - para la selección múltiple del flujo de factura consolidada. */
export class GetEnviosSinFacturaDto extends QueryOptionsDto {
    /** FK → ven_transporte */
    @IsInt()
    @IsNotEmpty()
    ide_vgtra: number;

    @IsDateString()
    @IsNotEmpty()
    fechaInicio: string;

    @IsDateString()
    @IsNotEmpty()
    fechaFin: string;
}
