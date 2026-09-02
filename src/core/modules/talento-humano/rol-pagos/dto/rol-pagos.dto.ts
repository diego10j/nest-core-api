import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsIn, IsInt, IsNumber, IsOptional, ValidateNested } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class GenerarRolDto {
    @ApiProperty({ description: 'ID de nrh_detalle_tipo_nomina (combinación tipo de nómina + tipo empleado/contrato)' })
    @IsInt()
    @Type(() => Number)
    ide_nrdtn: number;

    @ApiProperty({ description: 'ID del período (gen_perido_rol.ide_gepro)' })
    @IsInt()
    @Type(() => Number)
    ide_gepro: number;

    @ApiProperty({ description: 'Fecha del rol (YYYY-MM-DD) — se usa para vigencia de empleados y rangos de sum[...]' })
    @IsDateString()
    fecha_nrrol: string;
}

export class GetRolesDto extends QueryOptionsDto {
    @IsOptional()
    @IsDateString()
    fechaInicio?: string;

    @IsOptional()
    @IsDateString()
    fechaFin?: string;
}

export class GetRolByIdDto {
    @ApiProperty({ description: 'ID del rol (nrh_rol.ide_nrrol)' })
    @IsInt()
    @Type(() => Number)
    ide_nrrol: number;
}

export class AprobarRolDto {
    @ApiProperty({ description: 'ID del rol a aprobar (bloquea, ya no se puede recalcular)' })
    @IsInt()
    @Type(() => Number)
    ide_nrrol: number;
}

export class AnularRolDto {
    @ApiProperty({ description: 'ID del rol a anular' })
    @IsInt()
    @Type(() => Number)
    ide_nrrol: number;
}

export class CerrarRolDto {
    @ApiProperty({ description: 'ID del rol a cerrar (genera asiento contable + CxP por empleado)' })
    @IsInt()
    @Type(() => Number)
    ide_nrrol: number;
}

export class RecalcularRolDto {
    @ApiProperty({
        description:
            'ID del rol a recalcular (debe estar aún sin cerrar/anular). Borra su detalle previo, ' +
            'libera las horas extra que había consumido y vuelve a correr el cálculo completo.',
    })
    @IsInt()
    @Type(() => Number)
    ide_nrrol: number;
}

export class EditarDetalleRolItemDto {
    @ApiProperty({ description: 'ID de la línea a editar (nrh_detalle_rol.ide_nrdro)' })
    @IsInt()
    @Type(() => Number)
    ide_nrdro: number;

    @ApiProperty({ description: 'Nuevo valor de la línea' })
    @IsNumber()
    @Type(() => Number)
    valor_nrdro: number;
}

export class EditarDetalleRolDto {
    @ApiProperty({ description: 'ID del rol a editar (debe estar sin cerrar/anular)' })
    @IsInt()
    @Type(() => Number)
    ide_nrrol: number;

    @ApiProperty({
        description: 'Ediciones de valor por línea del detalle',
        type: [EditarDetalleRolItemDto],
        required: false,
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => EditarDetalleRolItemDto)
    ediciones?: EditarDetalleRolItemDto[];

    @ApiProperty({ description: 'IDs de líneas del detalle (nrh_detalle_rol.ide_nrdro) a eliminar', required: false, type: [Number] })
    @IsOptional()
    @IsArray()
    @IsInt({ each: true })
    @Type(() => Number)
    eliminaciones?: number[];
}

export class GenerarLiquidacionDecimoDto {
    @ApiProperty({ description: 'Concepto a liquidar: décimo tercero (período dic-nov) o décimo cuarto (período según región)' })
    @IsIn(['decimo_tercero', 'decimo_cuarto'])
    concepto: 'decimo_tercero' | 'decimo_cuarto';

    @ApiProperty({ description: 'Año de liquidación (año en que termina el período legal / se paga)' })
    @IsInt()
    @Type(() => Number)
    anio: number;

    @ApiProperty({ description: 'ID de nrh_detalle_tipo_nomina de "Nómina Pago Décimos" a usar para el rol generado' })
    @IsInt()
    @Type(() => Number)
    ide_nrdtn: number;

    @ApiProperty({ description: 'ID del período (gen_perido_rol.ide_gepro) al que se imputa el rol de liquidación' })
    @IsInt()
    @Type(() => Number)
    ide_gepro: number;
}
