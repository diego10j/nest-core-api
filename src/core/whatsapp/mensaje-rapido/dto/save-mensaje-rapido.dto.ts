import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class AdjuntoMensajeRapidoDto {
  @IsString()
  @IsNotEmpty()
  url: string;

  @IsString()
  @IsOptional()
  nombre?: string;

  @IsString()
  @IsNotEmpty()
  tipo: string; // image | video | document

  @IsString()
  @IsOptional()
  mime?: string;
}

export class SaveMensajeRapidoDto {
  @IsInt()
  @IsOptional()
  ide_whmer?: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  titulo_whmer: string;

  @IsString()
  @IsOptional()
  mensaje_whmer?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => AdjuntoMensajeRapidoDto)
  adjuntos_whmer?: AdjuntoMensajeRapidoDto[];

  @IsNumber()
  @IsOptional()
  @Min(-90)
  @Max(90)
  latitud_whmer?: number | null;

  @IsNumber()
  @IsOptional()
  @Min(-180)
  @Max(180)
  longitud_whmer?: number | null;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  ubicacion_nombre_whmer?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(300)
  ubicacion_direccion_whmer?: string | null;

  @IsBoolean()
  @IsOptional()
  activo_whmer?: boolean;
}
