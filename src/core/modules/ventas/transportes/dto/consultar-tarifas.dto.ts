import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

/**
 * Filtros de "Consultar Tarifas": búsqueda dinámica sobre los envíos YA REGISTRADOS (histórico
 * real, no la tarifa de catálogo) para que un vendedor pueda cotizar un costo referencial de
 * transporte. Todos los filtros son opcionales y combinables.
 */
export class ConsultarTarifasDto extends QueryOptionsDto {
    @IsInt()
    @IsOptional()
    ide_geprov?: number;

    @IsInt()
    @IsOptional()
    ide_gecant?: number;

    /** Texto libre - matchea nombre de provincia, cantón o dirección del cliente */
    @IsString()
    @IsOptional()
    descripcion?: string;

    /** Peso/cantidad aproximado a buscar - requiere `ide_inuni` */
    @IsNumber()
    @Min(0)
    @IsOptional()
    peso?: number;

    /** FK → inv_unidad de la unidad del peso buscado - requiere `peso` (se filtra por FK, no por
     * sigla en texto, para evitar problemas de coincidencia y reutilizar el catálogo ya
     * existente en el frontend, useGetListDataUnidadesMedida) */
    @IsInt()
    @IsOptional()
    ide_inuni?: number;
}
