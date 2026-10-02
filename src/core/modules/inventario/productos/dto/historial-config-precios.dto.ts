import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional } from 'class-validator';

export class ResumenHistorialConfigPreciosDto {
  @IsDateString()
  fechaInicio: string;

  @IsDateString()
  fechaFin: string;
}

export class HistorialConfigPreciosDto extends ResumenHistorialConfigPreciosDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  ide_inarti?: number;
}
