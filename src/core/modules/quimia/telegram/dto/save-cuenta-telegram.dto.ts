import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export class SaveCuentaTelegramDto {
  @IsInt()
  @IsOptional()
  ide_tlcue?: number;

  @IsString()
  @MinLength(3)
  @MaxLength(100)
  nombre_tlcue: string;

  /** Token de @BotFather. Vacío al editar = conservar el actual. */
  @IsString()
  @IsOptional()
  @Matches(/^\d{5,}:[A-Za-z0-9_-]{30,}$/, { message: 'El token no tiene el formato de Telegram (123456789:AAE...)' })
  token_tlcue?: string;

  /**
   * Base https pública del backend, sin /api (la misma del webhook de YCloud):
   * https://api.midominio.com. Vacío = usar HOST_API.
   */
  @IsString()
  @IsOptional()
  @MaxLength(300)
  @Matches(/^(https:\/\/[^\s/]+(\/[^\s]*)?)?$/, { message: 'La URL pública debe empezar con https://' })
  url_publica_tlcue?: string;

  @IsIn(['POLLING', 'WEBHOOK'])
  modo_tlcue: 'POLLING' | 'WEBHOOK';

  @IsInt()
  @IsOptional()
  ide_sucu?: number;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  usuario_erp_tlcue?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  mensaje_bienvenida_tlcue?: string;

  @IsBoolean()
  activo_tlcue: boolean;

  // ---------------- notas de voz

  @IsBoolean()
  @IsOptional()
  audio_activo_tlcue?: boolean;

  /** API key de Groq (console.groq.com). Vacío al editar = conservar la actual. */
  @IsString()
  @IsOptional()
  @Matches(/^gsk_[A-Za-z0-9]{20,}$/, { message: 'La API key de Groq empieza con gsk_' })
  groq_api_key_tlcue?: string;

  /** true = eliminar la API key de Groq guardada (se usará solo OpenAI). */
  @IsBoolean()
  @IsOptional()
  quitar_groq_api_key?: boolean;

  @IsInt()
  @IsOptional()
  @Min(10)
  @Max(600)
  audio_max_seg_tlcue?: number;

  @IsBoolean()
  @IsOptional()
  audio_respaldo_openai_tlcue?: boolean;

  @IsBoolean()
  @IsOptional()
  audio_mostrar_texto_tlcue?: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  audio_vocabulario_tlcue?: string;
}
