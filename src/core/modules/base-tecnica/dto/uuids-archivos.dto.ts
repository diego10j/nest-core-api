import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

/** Adjuntos (archivos o carpetas) seleccionados para eliminar en el explorador de archivos. */
export class UuidsArchivosDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  uuids: string[];
}
