import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { TelefonoDto } from '../../dto/telefono.dto';

export class EnviarUbicacionDto extends TelefonoDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitud: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitud: number;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  nombre?: string;

  @IsString()
  @IsOptional()
  @MaxLength(300)
  direccion?: string;
}
