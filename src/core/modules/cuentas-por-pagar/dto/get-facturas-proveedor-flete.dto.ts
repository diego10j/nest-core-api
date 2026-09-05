import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';

/** Facturas CxP de un proveedor/transportista candidatas para asociar a un grupo de envíos
 * "Pendiente Factura" (ver AsociarFacturaExistenteFleteDto). */
export class GetFacturasProveedorFleteDto {
    /** FK → gen_persona (transportista) */
    @IsInt()
    @IsNotEmpty()
    ide_geper: number;

    /** Filtra por monto similar (±5%) al total estimado del grupo de envíos, igual criterio
     * que getFacturasImportaciones. */
    @IsNumber()
    @IsOptional()
    @Type(() => Number)
    montoAprox?: number;
}
