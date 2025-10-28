import { PartialType } from '@nestjs/mapped-types';
import { IsInt, IsOptional, IsPositive } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class VentasMensualesDto extends PartialType(QueryOptionsDto) {
  @IsInt()
  @IsPositive()
  periodo: number;

  @IsInt()
  @IsOptional()
  ide_inarti?: number;
}
