import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class SaveNoDisponibleDto {
  @IsInt()
  @IsOptional()
  ide_whbnd?: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nombre_whbnd: string;

  @IsString()
  @IsOptional()
  @MaxLength(300)
  otros_nombres_whbnd?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  observacion_whbnd?: string;

  @IsBoolean()
  @IsOptional()
  activo_whbnd?: boolean;
}
