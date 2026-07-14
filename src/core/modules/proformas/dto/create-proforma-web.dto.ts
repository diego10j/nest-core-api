import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';
import { UniqueArrayField } from 'src/common/decorators/unique-array.validator.decorator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

class SolicitanteDto {
  @IsDateString()
  fecha: string;

  @IsString()
  nombres: string;

  @IsEmail()
  correo: string;

  @IsString()
  telefono: string;

  @IsString()
  provincia: string;

  @IsString()
  @IsOptional()
  direccion?: string;

  @IsString()
  formaPago: string;

  @IsString()
  formaEntrega: string;

  @IsString()
  @IsOptional()
  observacion?: string;

  @IsNumber()
  ideEmpr: number;

  @IsString()
  @IsOptional()
  uuid?: string;
}

class DetalleItemDto {
  @IsString()
  producto: string;

  @IsNumber()
  @IsPositive({ message: 'La cantidad debe ser mayor a cero' })
  cantidad: number;

  @IsString()
  @IsOptional()
  unidad?: string;

  // ─── Identificadores del producto ────────────────────────────────────────
  // Prioridad: ide_prod_erp → ideInarti → uuid_prod_erp → búsqueda por nombre
  // Si viene al menos uno, `producto` se usa sólo como observación.

  /** ID del artículo enviado por el catálogo web (ide_inarti). */
  @IsNumber()
  @IsOptional()
  ide_prod_erp?: number;

  /** UUID del artículo enviado por el catálogo web. */
  @IsString()
  @IsOptional()
  uuid_prod_erp?: string;

  /** ID del artículo — legado bot WhatsApp (compatible). */
  @IsNumber()
  @IsOptional()
  ideInarti?: number;
}

export class CreateProformaWebDto extends QueryOptionsDto {
  @IsArray({ message: 'Debe ser un array de objetos con productos' })
  @ArrayMaxSize(100, { message: 'El array no puede contener más de 100 elementos' })
  @ValidateNested({ each: true })
  @Type(() => DetalleItemDto)
  @UniqueArrayField('producto')
  detalles: DetalleItemDto[];

  @ValidateNested()
  @Type(() => SolicitanteDto)
  solicitante: SolicitanteDto;
}
