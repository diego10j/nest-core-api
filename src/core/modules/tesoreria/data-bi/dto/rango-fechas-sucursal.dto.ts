import { Transform } from 'class-transformer';
import { ArrayNotEmpty, IsDateString, IsInt, IsNotEmpty, IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class RangoFechasSucursalDto extends QueryOptionsDto {
  @IsDateString()
  fechaInicio: string;

  @IsDateString()
  fechaFin: string;

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
