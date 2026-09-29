import { IsInt, IsOptional } from 'class-validator';

import { RangoFechasSucursalDto } from './rango-fechas-sucursal.dto';

export class FacturasProvinciaDto extends RangoFechasSucursalDto {
  /** Filtrar por punto de emisión (opcional) */
  @IsInt()
  @IsOptional()
  ide_ccdaf?: number;
}
