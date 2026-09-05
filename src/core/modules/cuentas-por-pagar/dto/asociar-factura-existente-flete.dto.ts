import { IsInt, IsNotEmpty, IsOptional } from 'class-validator';

/**
 * Completa un grupo de envíos "Pendiente Factura" asociando una factura CxP que YA existe en
 * Documentos por Pagar (en vez de crearla desde un XML) - caso típico: el transportista mandó
 * la factura por otro medio y ya se registró manualmente. El valor de esa factura se reparte
 * proporcionalmente entre los envíos del grupo según el flete cobrado a cada cliente (ver
 * FleteConsolidadoSaveService.completarConFacturaExistente).
 */
export class AsociarFacturaExistenteFleteDto {
    /** FK → cxp_cab_flete_cons (grupo pendiente a completar) */
    @IsInt()
    @IsNotEmpty()
    ide_cpcfc: number;

    /** FK → cxp_cabece_factur (factura ya registrada, del mismo proveedor) */
    @IsInt()
    @IsNotEmpty()
    ide_cpcfa: number;

    /** FK → cxp_cabece_transa (anticipo ya pagado a este proveedor, sin documento asociado) -
     * si viene, se asocia ese pago en vez de dejar la factura pendiente de pago. */
    @IsInt()
    @IsOptional()
    ide_cpctr_anticipo?: number;
}
