import { IsDateString, IsInt, IsOptional, IsPositive } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class ComprobantesInvDto extends QueryOptionsDto {
  @IsDateString()
  fechaInicio: string;

  @IsDateString()
  fechaFin: string;

  @IsInt()
  @IsPositive()
  @IsOptional()
  ide_inbod?: number; // bodega

  @IsInt()
  @IsPositive()
  @IsOptional()
  ide_inepi?: number; // estado
}
