import { Type } from 'class-transformer';
import {
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

export class MensajeChatBdtDto {
  @IsIn(['user', 'assistant'])
  role: 'user' | 'assistant';

  @IsString()
  @MaxLength(6000)
  contenido: string;
}

export class ChatBaseTecnicaDto {
  /** UUID de la conversación (lo genera el frontend al abrir/reiniciar el chat). */
  @IsUUID()
  sesion: string;

  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  pregunta: string;

  /** Producto activo de la conversación (si ya se eligió o viene de la página de detalle). */
  @IsInt()
  @IsOptional()
  ide_inarti?: number;

  /**
   * DOCUMENTOS: responde solo con la base técnica.
   * IA_GENERAL: el usuario aceptó una respuesta de GPT tras "no encontrado".
   */
  @IsIn(['DOCUMENTOS', 'IA_GENERAL'])
  @IsOptional()
  modo?: 'DOCUMENTOS' | 'IA_GENERAL';

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => MensajeChatBdtDto)
  historial?: MensajeChatBdtDto[];
}
