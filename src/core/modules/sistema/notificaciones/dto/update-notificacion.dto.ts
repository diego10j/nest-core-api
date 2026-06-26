import { IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateNotificacionDto {
  @IsUUID()
  @IsNotEmpty()
  uuid: string;

  @IsString()
  @IsOptional()
  nombreNoti?: string;

  @IsString()
  @IsOptional()
  descripcionNoti?: string;

  @IsString()
  @IsOptional()
  codigoNoti?: string;

  @IsString()
  @IsOptional()
  iconoNoti?: string;

  @IsString()
  @IsOptional()
  colorNoti?: string;

  @IsString()
  @IsOptional()
  moduloNoti?: string;

  @IsBoolean()
  @IsOptional()
  activoNoti?: boolean;

  @IsArray()
  @IsOptional()
  botonesNoti?: Array<Record<string, unknown>>;

  @IsBoolean()
  @IsOptional()
  notificarTodosNoti?: boolean;
}
