import { IsInt, IsNotEmpty } from 'class-validator';
import { SearchDto } from 'src/common/dto/search.dto';

/** Búsqueda de asientos contables (con_cab_comp_cont) de un proveedor específico. */
export class SearchAsientoProveedorDto extends SearchDto {
    @IsInt()
    @IsNotEmpty()
    ide_geper: number;
}
