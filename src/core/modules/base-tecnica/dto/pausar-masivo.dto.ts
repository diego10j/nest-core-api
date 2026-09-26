import { IsBoolean } from 'class-validator';

export class PausarMasivoDto {
  @IsBoolean()
  pausar: boolean;
}
