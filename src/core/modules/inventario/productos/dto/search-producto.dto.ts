import { IsIn, IsOptional } from 'class-validator';
import { SearchDto } from 'src/common/dto/search.dto';

/** Búsqueda de productos para agregar a un documento (factura, proforma, compra, importación).
 * Por defecto es el comportamiento de ventas (`ide_intpr = 1`, solo productos vendibles) -
 * pasar `soloVentas=false` para compras/importaciones, donde se debe poder seleccionar
 * cualquier tipo de artículo (servicios, materia prima, etc.), no solo los de venta. */
export class SearchProductoDto extends SearchDto {
    @IsIn(['false'])
    @IsOptional()
    soloVentas?: 'false';
}
