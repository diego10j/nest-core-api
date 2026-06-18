import { IsDateString, ArrayNotEmpty, IsIn, IsInt, IsOptional, IsNotEmpty, IsArray } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class StockProductosDto extends QueryOptionsDto {
  @IsDateString()
  @IsOptional()
  fechaCorte?: string;

  @IsOptional()
  @ArrayNotEmpty()
  @IsNotEmpty({ each: true })
  @IsArray()
  ide_inbod?: number[];

  @IsIn(['true', 'false'])
  @IsOptional()
  onlyStock?: 'true' | 'false' = 'true';

  @IsInt()
  @IsOptional()
  ide_incate?: number;
}
