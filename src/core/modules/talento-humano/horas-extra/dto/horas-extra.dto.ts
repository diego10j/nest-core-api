import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { Max, IsArray, IsDateString, IsIn, IsInt, IsString, IsOptional, IsNotEmpty } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class DetectarCandidatasDto {
    @ApiProperty({ description: 'Fecha inicio del rango a analizar en asi_marcaciones (YYYY-MM-DD)' })
    @IsDateString()
    fechaInicio: string;

    @ApiProperty({ description: 'Fecha fin del rango a analizar (YYYY-MM-DD)' })
    @IsDateString()
    fechaFin: string;
}

export class GetCandidatasDto extends QueryOptionsDto {
    @ApiPropertyOptional({ description: 'Filtrar por estado: pendiente | aprobada | rechazada' })
    @IsOptional()
    @IsIn(['pendiente', 'aprobada', 'rechazada'])
    estado?: string;

    @IsOptional()
    @IsDateString()
    fechaInicio?: string;

    @IsOptional()
    @IsDateString()
    fechaFin?: string;
}

export class AprobarCandidataDto {
    @ApiProperty({ description: 'ID de nrh_hora_extra_candidata a aprobar' })
    @IsInt()
    @Type(() => Number)
    ide_nrhec: number;

    @ApiProperty({ description: 'Clasificación decidida por quien aprueba: suplementaria (50%) | extraordinaria (100%) | nocturna (25%)' })
    @IsIn(['suplementaria', 'extraordinaria', 'nocturna'])
    tipo_nrhec: 'suplementaria' | 'extraordinaria' | 'nocturna';

    @ApiProperty({ description: 'Justificación de por qué se trabajaron estas horas' })
    @IsString()
    @IsNotEmpty()
    justificacion_nrhec: string;
}

export class RechazarCandidatasDto {
    @ApiProperty({ description: 'IDs de nrh_hora_extra_candidata a rechazar', type: [Number] })
    @IsArray()
    @Type(() => Number)
    ide: number[];
}

export class SaveFeriadoDto {
    @ApiProperty({ description: 'Datos de nrh_feriado (fecha_nrfer, detalle_nrfer, activo_nrfer)' })
    data: Record<string, unknown>;
}

export class GenerarFeriadosDto {
    @ApiProperty({ description: 'Año a generar (no puede ser mayor al año actual)' })
    @IsInt()
    @Max(new Date().getFullYear())
    @Type(() => Number)
    anio: number;
}
