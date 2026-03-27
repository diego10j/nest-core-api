import { IsInt, IsPositive } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class IdTipoCompDto extends QueryOptionsDto {
    @IsInt()
    @IsPositive()
    ide_inmtc: number;
}
