import { IsBoolean, IsInt, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class SaveUsuarioTelegramDto {
  @IsInt()
  @IsOptional()
  ide_tlusu?: number;

  @IsInt()
  ide_tlcue: number;

  /** Con o sin código de país: 0991234567, +593 99 123 4567, 593991234567. */
  @IsString()
  @Matches(/^[+\d\s()-]{9,20}$/, { message: 'Teléfono inválido' })
  telefono_tlusu: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  alias_tlusu: string;

  @IsBoolean()
  activo_tlusu: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(300)
  observacion_tlusu?: string;
}
