import { IsBoolean, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class SaveBotConfigDto {
  @IsInt()
  @IsNotEmpty()
  ide_whcue: number;

  @IsBoolean()
  @IsOptional()
  activo_manual?: boolean;

  @IsBoolean()
  @IsOptional()
  usa_horario?: boolean;

  @IsInt()
  @IsOptional()
  ide_tihor?: number;

  @IsString()
  @IsOptional()
  nombre_bot?: string;

  @IsString()
  @IsOptional()
  prompt_sistema?: string;

  @IsString()
  @IsOptional()
  resp_ubicacion?: string;

  @IsString()
  @IsOptional()
  resp_horario?: string;

  @IsString()
  @IsOptional()
  resp_envio?: string;

  @IsString()
  @IsOptional()
  resp_catalogo?: string;

  @IsNumber()
  @IsOptional()
  monto_envio_gratis?: number;

  @IsInt()
  @IsOptional()
  max_intentos_fallo?: number;
}
