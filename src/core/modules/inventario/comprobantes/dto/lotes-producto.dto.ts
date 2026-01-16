import { IsInt } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class LotesProductoDto extends QueryOptionsDto {
    @IsInt()
    ide_inarti: number;
}
