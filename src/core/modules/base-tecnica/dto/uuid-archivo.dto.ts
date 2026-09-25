import { IsUUID } from 'class-validator';

export class UuidArchivoDto {
  /** uuid del adjunto (sis_archivo.uuid) tal como lo usa el explorador de archivos. */
  @IsUUID()
  uuid: string;
}
