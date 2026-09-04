import { IsInt, IsNotEmpty } from 'class-validator';
import { SearchDto } from 'src/common/dto/search.dto';

/** Búsqueda de movimientos de libro de bancos (tes_cab_libr_banc) ya vinculados a un cliente. */
export class SearchLibroBancoClienteDto extends SearchDto {
    @IsInt()
    @IsNotEmpty()
    ide_geper: number;
}
