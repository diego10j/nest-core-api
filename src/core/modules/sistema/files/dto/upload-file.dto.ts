import { IsOptional, IsString } from 'class-validator';

export class UploadFileDto {
  @IsString()
  ide_empr: string;

  @IsString()
  @IsOptional()
  sis_ide_arch?: string;

  @IsString()
  @IsOptional()
  ide_inarti?: string;
}
