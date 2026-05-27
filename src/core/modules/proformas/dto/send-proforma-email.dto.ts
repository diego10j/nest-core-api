import { IsArray, IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ArchivoAdjuntoDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsString()
  @IsOptional()
  tipoMime?: string;

  @IsString()
  @IsOptional()
  contenidoBase64?: string;

  @IsString()
  @IsOptional()
  ruta?: string;
}

export class SendProformaEmailDto {
  @IsInt()
  @IsNotEmpty()
  ide_cccpr: number;

  @IsNotEmpty()
  @IsEmail({}, { each: true })
  destinatario: string | string[];

  @IsOptional()
  @IsEmail({}, { each: true })
  @IsArray()
  cc?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ArchivoAdjuntoDto)
  adjuntos?: ArchivoAdjuntoDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  idsArchivos?: string[];
}
