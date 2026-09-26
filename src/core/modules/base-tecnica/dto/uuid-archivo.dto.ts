import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class UuidArchivoDto {
  /** uuid del adjunto del producto (sis_archivo.uuid). */
  @IsUUID()
  uuid: string;

  /** "Extracción mejorada": transcripción + extracción con el modelo superior. */
  @IsOptional()
  @IsBoolean()
  mejorado?: boolean;
}
