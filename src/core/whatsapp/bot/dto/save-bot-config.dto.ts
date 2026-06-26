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
  horario_atencion?: string;

  @IsNumber()
  @IsOptional()
  monto_envio_gratis?: number;

  @IsInt()
  @IsOptional()
  max_intentos_fallo?: number;
}
