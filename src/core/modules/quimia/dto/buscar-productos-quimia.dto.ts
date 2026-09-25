import { IsOptional, IsString, MaxLength } from 'class-validator';

export class BuscarProductosQuimiaDto {
  /** Texto a buscar; vacío = productos con base técnica más recientes. */
  @IsString()
  @IsOptional()
  @MaxLength(200)
  texto?: string;
}
