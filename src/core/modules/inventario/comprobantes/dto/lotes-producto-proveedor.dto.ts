import { IsInt, IsString } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class LotesProductoProveedorDto extends QueryOptionsDto {
    @IsInt()
    ide_inarti: number;

    @IsInt()
    ide_geper: number;

    @IsString()
    lote: string;

}
