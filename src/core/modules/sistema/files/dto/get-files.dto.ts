import { IsInt, IsPositive, IsOptional, IsString, IsNotEmpty, IsIn } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
export class GetFilesDto extends QueryOptionsDto {
  @IsString()
  @IsIn(['files', 'favorites', 'trash'])
  @IsNotEmpty()
  mode: string;

  @IsInt()
  @IsPositive()
  @IsOptional()
  ide_archi?: number;

  @IsInt()
  @IsPositive()
  @IsOptional()
  ide_inarti?: number; // para filtrar contenido del producto
}
