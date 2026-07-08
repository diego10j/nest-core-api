import { IsInt, IsOptional, IsString } from 'class-validator';

export class GetExisteClienteDto {
  @IsString()
  identificac_geper: string;

  @IsInt()
  @IsOptional()
  ide_geper?: number;
}
