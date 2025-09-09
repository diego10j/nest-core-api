import { IsInt, IsString, MinLength } from 'class-validator';

export class HorarioLoginDto {
  @IsInt()
  ide_usua: number;

  @IsInt()
  ide_perf: number;

  @IsString()
  @MinLength(4)
  nom_perf: string;
}
