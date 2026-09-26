import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SaveComandoTelegramDto {
  @IsInt()
  @IsOptional()
  ide_qmcom?: number;

  @IsInt()
  ide_tlcue: number;

  /** Sin "/": minúsculas, números y "_" (ej. ventas_diarias). */
  @IsString()
  @MinLength(2)
  @MaxLength(33)
  comando: string;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  descripcion: string;

  /** Clave del catálogo de reportes (RESUMEN_DIARIO, VENTAS_ANUALES…). */
  @IsString()
  reporte: string;

  @IsObject()
  parametros: Record<string, unknown>;

  @IsBoolean()
  activo: boolean;
}

export class IdeComandoTelegramDto {
  @Type(() => Number)
  @IsInt()
  ide_qmcom: number;
}

export class SetActivoComandoTelegramDto {
  @IsInt()
  ide_qmcom: number;

  @IsBoolean()
  activo: boolean;
}


export class ProbarReporteDto {
  @IsString()
  reporte: string;

  @IsObject()
  @IsOptional()
  parametros?: Record<string, unknown>;

  /** Para ejecutarlo con la sucursal de la cuenta del bot (igual que en Telegram). */
  @IsInt()
  @IsOptional()
  ide_tlcue?: number;
}
