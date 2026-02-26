import { IsDateString, IsInt, IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class FacturasDto extends QueryOptionsDto {
  @IsDateString()
  fechaInicio: string;

  @IsDateString()
  fechaFin: string;

  @IsInt()
  @IsOptional()
  ide_ccdaf?: number;

  @IsInt()
  @IsOptional()
  ide_sresc?: number;

  @IsInt()
  @IsOptional()
  ide_ccefa?: number;
}
