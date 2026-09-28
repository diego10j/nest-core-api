import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional } from 'class-validator';

/** "Generar Contenido" de Editar Producto a partir de la base técnica. */
export class GenerarContenidoDto {
  @Type(() => Number)
  @IsInt()
  ide_inarti: number;

  /** El usuario aceptó que GPT complemente lo que los documentos no cubren. */
  @IsBoolean()
  @IsOptional()
  complementar?: boolean;
}
