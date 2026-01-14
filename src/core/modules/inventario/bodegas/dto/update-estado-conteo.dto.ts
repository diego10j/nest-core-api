import { IsInt } from 'class-validator';

export class UpdateEstadoConteoDto {
  @IsInt()
  ide_inccf: number;

  @IsInt()
  ide_inec: number;
}
