import { IsInt, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class RegistrarConteoFisicoDto extends QueryOptionsDto {
  @IsInt()
  @IsPositive()
  ide_indcf: number;

  @IsNumber()
  cantidadContada: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  observacion?: string;
}
