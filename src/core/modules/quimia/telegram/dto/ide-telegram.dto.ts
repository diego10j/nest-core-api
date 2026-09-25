import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional } from 'class-validator';

export class IdeCuentaTelegramDto {
  @Type(() => Number)
  @IsInt()
  ide_tlcue: number;
}

export class IdeUsuarioTelegramDto {
  @IsInt()
  ide_tlusu: number;
}

export class SetActivoUsuarioTelegramDto {
  @IsInt()
  ide_tlusu: number;

  @IsBoolean()
  activo: boolean;

  /** true = además desvincula el chat (el número deberá volver a compartir su contacto). */
  @IsBoolean()
  @IsOptional()
  desvincular?: boolean;
}
