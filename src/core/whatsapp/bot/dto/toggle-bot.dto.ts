import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';

export class ToggleBotDto {
  @IsInt()
  ideWhcue: number;

  @IsBoolean()
  activar: boolean;

  @IsString()
  @IsOptional()
  observacion?: string;
}
