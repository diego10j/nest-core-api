import { IsInt, IsNotEmpty, IsOptional } from 'class-validator';
import { SearchDto } from 'src/common/dto/search.dto';

/** Búsqueda de cabeceras de transacción (cxp_cabece_transa) de un proveedor, para reasignar detalle. */
export class SearchCabeceraTrnDto extends SearchDto {
    @IsInt()
    @IsNotEmpty()
    ide_geper: number;

    /** Excluye la cabecera actual del resultado (no tiene sentido "mover" a la misma). */
    @IsInt()
    @IsOptional()
    excluir_ide_cpctr?: number;
}
