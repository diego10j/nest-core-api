import { IsIn, IsOptional, Matches } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

/** Filtros de la página Control de stock (aplican a las tarjetas, al dashboard y a las tablas). */
export class GetControlStockDto extends QueryOptionsDto {
  /** ide_inbod separados por coma (vacío = todas las bodegas). */
  @IsOptional()
  @Matches(/^[0-9,]*$/)
  bodegas?: string;

  /** ide_incate separados por coma (vacío = todas las categorías). */
  @IsOptional()
  @Matches(/^[0-9,]*$/)
  categorias?: string;

  /**
   * ALERTAS = stock bajo (sin stock, negativo, crítico o bajo el ideal), por prioridad;
   * MAS_STOCK = productos con existencia, por valor de inventario;
   * INMOVIL = con existencia y sin salidas hace más de 180 días, por valor;
   * REPORTE (por defecto) = productos con existencia, por categoría y nombre.
   */
  @IsOptional()
  @IsIn(['ALERTAS', 'MAS_STOCK', 'INMOVIL', 'REPORTE'])
  vista?: 'ALERTAS' | 'MAS_STOCK' | 'INMOVIL' | 'REPORTE';

  /** NEGATIVO,SIN_STOCK,CRITICO,BAJO,ADECUADO,EXCESO,SIN_CONFIG separados por coma. */
  @IsOptional()
  @Matches(/^[A-Z_,]*$/)
  estados?: string;

  /** Solo para el REPORTE: incluye también los productos sin existencia. */
  @IsOptional()
  @IsIn(['true', 'false'])
  incluirSinStock?: 'true' | 'false';
}
