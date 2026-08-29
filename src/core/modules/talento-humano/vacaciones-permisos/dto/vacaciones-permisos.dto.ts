import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class GetSaldoVacacionesDto {
    @ApiProperty({ description: 'ID del empleado (gth_empleado.ide_gtemp)' })
    @IsInt()
    @Type(() => Number)
    ide_gtemp: number;
}

export class RegistrarMovimientoVacacionDto {
    @ApiProperty({ description: 'ID del empleado (gth_empleado.ide_gtemp)' })
    @IsInt()
    @Type(() => Number)
    ide_gtemp: number;

    @ApiProperty({ description: 'Tipo de movimiento: acumulado | adicional | descontado' })
    @IsIn(['acumulado', 'adicional', 'descontado'])
    tipo: 'acumulado' | 'adicional' | 'descontado';

    @ApiProperty({ description: 'Días del movimiento' })
    @IsNumber()
    dias: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    observacion?: string;
}

export class CrearPermisoDto {
    @ApiProperty({ description: 'ID del empleado (gth_empleado.ide_gtemp)' })
    @IsInt()
    @Type(() => Number)
    ide_gtemp: number;

    @ApiProperty({ description: '1=permiso normal, 2=cargo a vacaciones, 3=horas extra' })
    @IsIn([1, 2, 3])
    @Type(() => Number)
    tipo_aspvh: number;

    @ApiProperty({ description: 'Fecha desde (YYYY-MM-DD)' })
    @IsDateString()
    fecha_desde_aspvh: string;

    @ApiProperty({ description: 'Fecha hasta (YYYY-MM-DD)' })
    @IsDateString()
    fecha_hasta_aspvh: string;

    @ApiPropertyOptional({ description: 'Días solicitados (para permiso con cargo a vacaciones)' })
    @IsOptional()
    @IsNumber()
    nro_dias_aspvh?: number;

    @ApiPropertyOptional({ description: 'Horas solicitadas (para permiso por horas)' })
    @IsOptional()
    @IsNumber()
    nro_horas_aspvh?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    detalle_aspvh?: string;
}

export class AnularPermisoDto {
    @ApiProperty({ description: 'ID del permiso (asi_permisos_vacacion_hext.ide_aspvh)' })
    @IsInt()
    @Type(() => Number)
    ide_aspvh: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    razon_anula_aspvh?: string;
}

export class GetPermisosDto extends QueryOptionsDto {
    @ApiPropertyOptional({ description: 'Filtrar por empleado' })
    @IsOptional()
    @IsInt()
    @Type(() => Number)
    ide_gtemp?: number;

    @IsOptional()
    @IsDateString()
    fechaInicio?: string;

    @IsOptional()
    @IsDateString()
    fechaFin?: string;
}
