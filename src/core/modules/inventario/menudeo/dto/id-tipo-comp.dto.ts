import { IsInt } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class IdTipoCompDto extends QueryOptionsDto {
    @IsInt()
    ide_inmtc: number;
}
