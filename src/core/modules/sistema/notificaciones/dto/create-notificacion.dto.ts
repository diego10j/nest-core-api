import { IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateNotificacionDto {
  @IsString()
  @IsNotEmpty()
  nombreNoti: string;

  @IsString()
  @IsOptional()
  descripcionNoti?: string;

  @IsString()
  @IsNotEmpty()
  codigoNoti: string;

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

  @IsArray()
  @IsOptional()
  ideUsuaList?: number[];
}
