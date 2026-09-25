import { IsBoolean, IsInt } from 'class-validator';

export class SetVigenteOrigenDto {
  @IsInt()
  ide_bdpfa: number;

  @IsBoolean()
  vigente: boolean;
}
