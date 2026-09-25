import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class SaveCuentaTelegramDto {
  @IsInt()
  @IsOptional()
  ide_tlcue?: number;

  @IsString()
  @MinLength(3)
  @MaxLength(100)
  nombre_tlcue: string;

  /** Token de @BotFather. Vacío al editar = conservar el actual. */
  @IsString()
  @IsOptional()
  @Matches(/^\d{5,}:[A-Za-z0-9_-]{30,}$/, { message: 'El token no tiene el formato de Telegram (123456789:AAE...)' })
  token_tlcue?: string;

  @IsIn(['POLLING', 'WEBHOOK'])
  modo_tlcue: 'POLLING' | 'WEBHOOK';

  @IsInt()
  @IsOptional()
  ide_sucu?: number;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  usuario_erp_tlcue?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  mensaje_bienvenida_tlcue?: string;

  @IsBoolean()
  activo_tlcue: boolean;
}
