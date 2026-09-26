import { IsBoolean, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class ConfiguracionBdtDto {
  @IsBoolean()
  auto_activo_bdcfg: boolean;

  /** null = sin tope */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000)
  tope_diario_usd_bdcfg: number | null;
}
