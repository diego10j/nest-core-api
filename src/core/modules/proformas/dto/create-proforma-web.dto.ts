import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsNumber,
  IsOptional,
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
  cantidad: number;

  @IsString()
  @IsOptional()
  unidad?: string;

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
