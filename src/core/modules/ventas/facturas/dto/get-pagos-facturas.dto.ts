import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class PagosFacturasDto extends QueryOptionsDto {
  @IsDateString()
  fechaInicio: string;

  @IsDateString()
  fechaFin: string;

  @IsInt()
  @IsOptional()
  ide_ccdaf?: number;

  @IsIn(['true', 'false']) // Solo permite estos valores
  @IsOptional()
  conDiferencias?: 'true' | 'false';

}
