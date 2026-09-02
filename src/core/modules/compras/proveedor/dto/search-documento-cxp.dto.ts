import { IsIn, IsInt, IsNotEmpty } from 'class-validator';
import { SearchDto } from 'src/common/dto/search.dto';

/** Búsqueda de facturas o notas de crédito de compra (ambas viven en cxp_cabece_factur, ver ide_cntdo) de un proveedor. */
export class SearchDocumentoCxPDto extends SearchDto {
    @IsInt()
    @IsNotEmpty()
    ide_geper: number;

    @IsIn(['factura', 'nota_credito'])
    @IsNotEmpty()
    tipo: 'factura' | 'nota_credito';
}
