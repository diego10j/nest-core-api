import { IsBoolean, IsDateString, IsInt, IsOptional } from 'class-validator';
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

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  conDiferencias?: boolean = false;
}
