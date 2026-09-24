import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class RefrescarCacheCatalogosDto {
    /**
     * false (default): procesa solo los productos pendientes (inv_catalogo_pendiente).
     * true: recalcula todos los catálogos que estén en caché.
     */
    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => value === 'true' || value === true)
    todo?: boolean = false;
}
