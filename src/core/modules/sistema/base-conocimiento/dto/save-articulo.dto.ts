import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  ValidateNested,
} from 'class-validator';

export class RelacionItem {
  @IsIn(['PRODUCTO', 'PERSONA'])
  @IsNotEmpty()
  tipoRelacion: 'PRODUCTO' | 'PERSONA';

  @IsInt()
  @IsNotEmpty()
  ideReferencia: number;

  @IsString()
  @IsNotEmpty()
  nombreReferencia: string;

  @IsString()
  @IsOptional()
  subtipoReferencia?: string;
}

export class ArchivoPendienteItem {
  @IsUUID()
  @IsNotEmpty()
  uuid: string;

  @IsString()
  @IsNotEmpty()
  nombreOriginal: string;

  // Nombre físico en disco (uuid + extensión), generado por uploadArchivo — se valida el
  // formato para evitar path traversal al usarlo luego en un join() de ruta.
  @Matches(/^[a-zA-Z0-9-]+\.[a-zA-Z0-9]+$/)
  @IsNotEmpty()
  nombreDisco: string;

  @IsString()
  @IsOptional()
  mime?: string;

  @IsString()
  @IsOptional()
  extension?: string;

  @IsInt()
  @IsPositive()
  @IsOptional()
  peso?: number;
}

export class SaveArticuloDto {
  @IsUUID()
  @IsOptional()
  uuid?: string;

  @IsString()
  @IsNotEmpty()
  titulo: string;

  @IsString()
  @IsOptional()
  contenido?: string;

  @IsInt()
  @IsOptional()
  ideCcat?: number | null;

  @IsBoolean()
  @IsOptional()
  favorito?: boolean;

  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ValidateNested({ each: true })
  @Type(() => RelacionItem)
  @IsOptional()
  relaciones?: RelacionItem[];

  // Adjuntos ya subidos a disco (vía uploadArchivo) pero aún no vinculados a ningún artículo
  // — se vinculan recién aquí, en la misma transacción que crea/actualiza el artículo.
  @ValidateNested({ each: true })
  @Type(() => ArchivoPendienteItem)
  @IsOptional()
  archivos?: ArchivoPendienteItem[];
}
