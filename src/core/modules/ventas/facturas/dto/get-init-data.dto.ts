import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional } from 'class-validator';

/**
 * Parámetros para obtener los datos iniciales necesarios para
 * abrir el formulario de nueva factura (punto de emisión, IVA,
 * formas de pago, tipos de guía y camiones).
 */
export class GetInitDataDto {
    @ApiProperty({ description: 'ID del punto de emisión (cxc_datos_fac.ide_ccdaf)' })
    @IsInt()
    @Type(() => Number)
    ide_ccdaf: number;
}

/**
 * Parámetros para obtener los datos de un producto al seleccionarlo
 * en una línea de detalle de factura.
 */
export class GetProductoDetalleDto {
    @ApiProperty({ description: 'ID del artículo (inv_articulo.ide_inarti)' })
    @IsInt()
    @Type(() => Number)
    ide_inarti: number;

    @ApiPropertyOptional({
        description: 'ID del cliente para recuperar el último precio de venta (gen_persona.ide_geper)',
    })
    @IsInt()
    @IsOptional()
    @Type(() => Number)
    ide_geper?: number;
}
