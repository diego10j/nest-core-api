import { IsDateString, IsInt, IsOptional, IsUUID } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class TrnProveedorDto extends QueryOptionsDto {
  @IsDateString()
  fechaInicio: string;

  @IsDateString()
  fechaFin: string;

  @IsInt()
  @IsOptional()
  ide_geper?: number;

  @IsUUID('4')
  @IsOptional()
  uuid?: string;
}
