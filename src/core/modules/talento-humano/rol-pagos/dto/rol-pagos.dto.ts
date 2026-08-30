import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional } from 'class-validator';
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
