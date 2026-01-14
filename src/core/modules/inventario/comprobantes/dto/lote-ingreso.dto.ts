import { IsInt } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class LoteIngreso extends QueryOptionsDto {
  @IsInt()
  ide_indci_ingreso: number;
}
