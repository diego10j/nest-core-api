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

  @IsBoolean()
  @IsOptional()
  reduce_mensajes_whbco?: boolean;

  @IsInt()
  @IsOptional()
  segundos_espera_whbco?: number;

  // Horas de silencio del cliente antes de reactivar automáticamente un chat viejo (no
  // nuevo, en modo ASESOR) de un cliente conocido cuyo mensaje es una consulta de venta
  // nueva. `null` = reactivación automática desactivada (default) — cada cuenta define
  // su propio umbral en horas, no queda un número quemado en el código.
  @IsInt()
  @IsOptional()
  tiempo_reactiva_chats_viejos?: number | null;
}
