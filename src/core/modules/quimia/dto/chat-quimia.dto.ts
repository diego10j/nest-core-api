import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class MensajeQuimiaDto {
  @IsIn(['user', 'assistant'])
  role: 'user' | 'assistant';

  @IsString()
  @MaxLength(6000)
  contenido: string;
}

export class ChatQuimiaDto {
  /** UUID de la conversación (lo genera el cliente al abrir/reiniciar el chat). */
  @IsUUID()
  sesion: string;

  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  pregunta: string;

  /** Producto activo de la conversación (elegido antes o el de la página de detalle). */
  @IsInt()
  @IsOptional()
  ide_inarti?: number;

  /**
   * AGENTE: responde con herramientas (base técnica + ERP).
   * IA_GENERAL: el usuario aceptó una respuesta de conocimiento general tras "no encontrado".
   * (DOCUMENTOS se acepta por compatibilidad y equivale a AGENTE.)
   */
  @Transform(({ value }) => (value === 'DOCUMENTOS' ? 'AGENTE' : value))
  @IsIn(['AGENTE', 'IA_GENERAL'])
  @IsOptional()
  modo?: 'AGENTE' | 'IA_GENERAL';

  @IsArray()
  @ArrayMaxSize(20)
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => MensajeQuimiaDto)
  historial?: MensajeQuimiaDto[];
}

/** API JSON (Telegram u otros integradores): igual que el chat + el canal de origen. */
export class PreguntarQuimiaDto extends ChatQuimiaDto {
  @IsIn(['API', 'TELEGRAM'])
  @IsOptional()
  canal?: 'API' | 'TELEGRAM';
}
