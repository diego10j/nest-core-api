import { IsString, MinLength } from 'class-validator';

export class RegistrarVisitaDto {
  /** Path de la ruta visitada (ej. /dashboard/ventas/facturacion/list), debe coincidir con sis_opcion.tipo_opci. */
  @IsString()
  @MinLength(1)
  path: string;
}
