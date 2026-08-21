import { IsNotEmpty, Matches } from 'class-validator';

export class DeleteArchivoTempDto {
  // Mismo formato validado que ArchivoPendienteItem.nombreDisco — evita path traversal.
  @Matches(/^[a-zA-Z0-9-]+\.[a-zA-Z0-9]+$/)
  @IsNotEmpty()
  nombreDisco: string;
}
