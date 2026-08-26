import { Transform } from 'class-transformer';
import { ArrayNotEmpty, IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class TopCuentasTesoreriaDto extends QueryOptionsDto {
  @IsDateString()
  fechaInicio: string;

  @IsDateString()
  fechaFin: string;

  @IsNumber()
  @IsOptional()
  limit?: number = 10;

  @IsOptional()
  @IsInt({ each: true })
  @ArrayNotEmpty()
  @IsNotEmpty({ each: true })
  @Transform(({ value }) => {
    if (value == null) return undefined;
    if (Array.isArray(value)) return value.map(Number);
    return String(value).split(',').map(Number);
  })
  ide_sucu?: number[];
}
