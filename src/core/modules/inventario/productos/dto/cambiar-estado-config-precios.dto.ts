import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsInt, IsOptional } from 'class-validator';

export class CambiarEstadoConfigPreciosDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  ide: number[];

  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @IsBoolean()
  autorizado?: boolean;
}
