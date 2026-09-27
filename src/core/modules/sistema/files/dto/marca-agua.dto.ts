import { IsUUID } from 'class-validator';

/** Archivo (sis_archivo.uuid) al que se pone la marca de agua o se reemplaza el contenido. */
export class ArchivoUuidDto {
  @IsUUID()
  uuid: string;
}
