import { IsDateString, IsNumber, IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class TopClientesProductoDto extends QueryOptionsDto {
  @IsNumber()
  ide_inarti: number;

  @IsDateString()
  fechaInicio: string;

  @IsDateString()
  fechaFin: string;

  @IsNumber()
  @IsOptional()
  limit?: number = 10;
}
