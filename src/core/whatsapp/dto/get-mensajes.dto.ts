import { Type, Transform } from 'class-transformer';
import { IsInt, IsBoolean, IsNotEmpty, IsOptional, IsPositive } from 'class-validator';

export class GetMensajesDto {
  @IsInt()
  @IsNotEmpty()
  @Type(() => Number)
  chatId: number;

  @IsInt()
  @IsPositive()
  @IsOptional()
  @Type(() => Number)
  limit?: number = 25;

  /** Cursor hacia atrás: trae mensajes con ide_whmem < beforeId (scroll hacia arriba / cargar más) */
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  beforeId?: number;

  /** Cursor hacia adelante: trae mensajes con ide_whmem > afterId (actualización por WebSocket) */
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  afterId?: number;

  /**
   * true = consulta de solo lectura desde otro módulo (ej. "Ver conversación" en el detalle
   * de una proforma) — no marca el chat como leído ni descuenta su contador de no leídos.
   * Sin esto, abrir esa vista silenciaba en el dashboard de WhatsApp un chat que el agente
   * todavía no había revisado ahí.
   */
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  soloLectura?: boolean;
}
