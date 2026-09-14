import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

import { MensajeHistorialDto } from './mensaje-historial.dto';

export class ConsultarIaProductoDto {
  @IsInt()
  @IsOptional()
  @Transform(({ value }) => (value != null ? Number(value) : 0))
  ideEmpr?: number = 0;

  /** Nombre del producto tal como lo muestra el portal — no hay `ideProducto`/FK válida
   * porque el catálogo del portal vive en otra base de datos, sin integración con el ERP. */
  @IsOptional()
  @IsString()
  nombreProducto?: string;

  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsEmail()
  correo: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MensajeHistorialDto)
  historial: MensajeHistorialDto[];

  @IsString()
  @IsNotEmpty()
  pregunta: string;
}
