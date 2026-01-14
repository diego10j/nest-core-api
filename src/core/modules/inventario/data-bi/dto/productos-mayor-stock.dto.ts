import { IsDateString, IsNumber, IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class ProductosMayorStockDto extends QueryOptionsDto {
  @IsNumber()
  @IsOptional()
  diasAnalisis?: number = 90;

  @IsDateString()
  @IsOptional()
  fechaCorte?: string;

  @IsNumber()
  @IsOptional()
  limit?: number;
}
