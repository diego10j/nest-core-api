import { PartialType } from '@nestjs/mapped-types';
import { IsInt, IsPositive } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class VentasMensualesDto extends PartialType(QueryOptionsDto) {
  @IsInt()
  @IsPositive()
  periodo: number;
}
