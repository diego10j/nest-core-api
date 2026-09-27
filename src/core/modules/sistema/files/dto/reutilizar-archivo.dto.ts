import { Type } from 'class-transformer';
import { IsInt, IsUUID, IsArray, ArrayMaxSize, ArrayNotEmpty } from 'class-validator';

/** "Reutilizar documento": asociar un archivo (uuid) a otros productos. */
export class ReutilizarArchivoDto {
  @IsUUID()
  uuid: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @Type(() => Number)
  @IsInt({ each: true })
  productos: number[];
}
