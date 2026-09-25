import { IsBoolean, IsInt } from 'class-validator';

export class CalificarConsultaDto {
  @IsInt()
  ide_bdcon: number;

  @IsBoolean()
  util: boolean;
}
