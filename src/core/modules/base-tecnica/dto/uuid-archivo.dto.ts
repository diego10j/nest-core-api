import { IsUUID } from 'class-validator';

export class UuidArchivoDto {
  /** uuid del adjunto del producto (sis_archivo.uuid). */
  @IsUUID()
  uuid: string;
}
