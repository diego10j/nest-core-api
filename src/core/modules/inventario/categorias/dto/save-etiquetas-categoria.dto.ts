import { ArrayNotEmpty, IsArray, IsInt, IsNotEmpty, IsString } from 'class-validator';

export class SaveEtiquetasCategoriaDto {
  @IsInt()
  @IsNotEmpty()
  ide_incate: number;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  etiquetas: string[];
}
