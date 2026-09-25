import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsInt } from 'class-validator';

export class IdesDocumentosDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  ides_bddoc: number[];
}
