import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsPositive } from 'class-validator';

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
}
