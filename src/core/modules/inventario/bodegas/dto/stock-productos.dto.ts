import { IsBoolean, IsDateString, ArrayNotEmpty, IsOptional, IsNotEmpty, IsArray } from 'class-validator';
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

  @IsBoolean()
  @IsOptional()
  onlyStock?: boolean = true;
}
