import { IsDateString, IsIn, IsInt, IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class EnviosFacturasDto extends QueryOptionsDto {
  @IsDateString()
  fechaInicio: string;

  @IsDateString()
  fechaFin: string;

  @IsInt()
  @IsOptional()
  ide_usua?: number;

  @IsIn([1, 2, 3])
  @IsOptional()
  tipo?: number;

  @IsInt()
  @IsOptional()
  ide_cceen?: number;
}
