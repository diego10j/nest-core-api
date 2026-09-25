import { IsBoolean, IsInt, IsOptional } from 'class-validator';

export class ProcesarProductoDto {
  @IsInt()
  ide_inarti: number;

  /** Re-procesar aunque el archivo no haya cambiado (ej. tras mejorar los prompts). */
  @IsBoolean()
  @IsOptional()
  forzar?: boolean;
}
