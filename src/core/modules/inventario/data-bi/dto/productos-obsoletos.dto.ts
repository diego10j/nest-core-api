import { IsNumber, IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class ProductosObsoletosDto extends QueryOptionsDto {
  @IsNumber()
  @IsOptional()
  mesesSinMovimiento?: number = 12;
}
