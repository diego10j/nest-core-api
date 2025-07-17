import { IsInt, IsPositive } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class CabComprobanteInventarioDto extends QueryOptionsDto {

    @IsInt()
    @IsPositive()
    ide_incci: number;
}
