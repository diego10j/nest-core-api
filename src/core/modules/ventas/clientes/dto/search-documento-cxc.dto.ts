import { IsInt, IsNotEmpty } from 'class-validator';
import { SearchDto } from 'src/common/dto/search.dto';

/**
 * Búsqueda de facturas de venta (cxc_cabece_factura) de un cliente. A diferencia de
 * CxP, acá no hay una rama de "nota_credito": las notas de crédito de venta viven en
 * una tabla físicamente distinta (cxp_cabecera_nota, pese al prefijo cxp_ - ver
 * notas-credito-save.service.ts) y cxc_detall_transa.ide_cccfa solo puede apuntar a
 * cxc_cabece_factura (la FK lo exige) - una línea de "nota de crédito" en la
 * transacción se identifica por su ide_ccttr, no por un documento separado.
 */
export class SearchDocumentoCxCDto extends SearchDto {
    @IsInt()
    @IsNotEmpty()
    ide_geper: number;
}
