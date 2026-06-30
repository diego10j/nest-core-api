import { IsInt, IsNotEmpty, IsString } from 'class-validator';

export class DeleteEtiquetaCategoriaDto {
  @IsInt()
  @IsNotEmpty()
  ide_incate: number;

  @IsString()
  @IsNotEmpty()
  etiqueta: string;
}
