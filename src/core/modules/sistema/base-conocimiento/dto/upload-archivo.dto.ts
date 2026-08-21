import { IsString } from 'class-validator';

export class UploadArchivoDto {
  @IsString()
  ideCono: string;
}
