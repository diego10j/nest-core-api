import { IsDateString, IsIn, IsInt, IsOptional, IsPositive } from 'class-validator';
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

  @IsInt()
  @IsOptional()
  @IsIn([1, -1])
  signo?: number; // puede ser undefined, 1, -1
}
