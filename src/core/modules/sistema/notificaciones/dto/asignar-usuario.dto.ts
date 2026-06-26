import { IsInt, IsNotEmpty } from 'class-validator';

export class AsignarUsuarioDto {
  @IsInt()
  @IsNotEmpty()
  ideUsua: number;
}
