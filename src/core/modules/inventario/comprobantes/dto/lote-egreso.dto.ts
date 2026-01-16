import { IsInt } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class LoteEgreso extends QueryOptionsDto {
    @IsInt()
    ide_indci_egreso: number;
}
