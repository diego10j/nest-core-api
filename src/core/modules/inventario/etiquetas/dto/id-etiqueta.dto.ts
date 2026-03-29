import { IsInt, IsPositive } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class IdEtiquetaDto extends QueryOptionsDto {
    @IsInt()
    @IsPositive()
    ide_ineta: number;
}
