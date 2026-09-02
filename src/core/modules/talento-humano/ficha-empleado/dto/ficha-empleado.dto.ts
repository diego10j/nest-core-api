import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt } from 'class-validator';
import { SaveDto } from 'src/common/dto/save.dto';

export class GetByEmpleadoDto {
    @ApiProperty({ description: 'ID del empleado (gth_empleado.ide_gtemp)' })
    @IsInt()
    @Type(() => Number)
    ide_gtemp: number;
}

export class SaveEducacionDto extends SaveDto {
    @ApiProperty({
        description:
            'Datos de gth_educacion_empleado. Requeridos al crear: ide_gtemp, ide_gtted (tipo de ' +
            'educación), ide_gtttp (título obtenido). Opcionales: ide_geins (institución), ide_gttes ' +
            '(especialidad), ide_gtana, anio_gtede, anio_grado_gtede, registro_titulo_gtede (SENESCYT), ' +
            'observaciones_gtede.',
    })
    declare data: Record<string, unknown>;
}

export class EliminarEducacionDto {
    @ApiProperty({ description: 'ID del registro de educación (gth_educacion_empleado.ide_gtede)' })
    @IsInt()
    @Type(() => Number)
    ide_gtede: number;
}

export class SaveExperienciaLaboralDto extends SaveDto {
    @ApiProperty({
        description:
            'Datos de gth_experiencia_laboral_emplea. Requeridos al crear: ide_gtemp, ide_geins ' +
            '(empresa anterior), detalle_cargo_gtele (cargo desempeñado). Opcionales: area_desempenio_gtele, ' +
            'nro_subordinados_gtele, jefe_inmediato_gtele, cargo_jefe_gtele, telefono_gtele, ' +
            'funciones_desempenio_gtele, motivo_salida_gtele, fecha_ingreso_gtele, fecha_salida_gtele.',
    })
    declare data: Record<string, unknown>;
}

export class EliminarExperienciaLaboralDto {
    @ApiProperty({ description: 'ID del registro de experiencia laboral (gth_experiencia_laboral_emplea.ide_gtele)' })
    @IsInt()
    @Type(() => Number)
    ide_gtele: number;
}

export class SaveCuentaBancariaDto extends SaveDto {
    @ApiProperty({
        description:
            'Datos de gth_cuenta_bancaria_empleado. Requeridos al crear: ide_gtemp, ide_geins ' +
            '(institución financiera), ide_gttcb (tipo de cuenta), numero_cuenta_gtcbe. Opcionales: ' +
            'individual_conjunta_gtcbe (0=Conjunta, 1=Individual, default 1), acreditacion_gtcbe ' +
            '(default false), saldo_promedio_gtcbe.',
    })
    declare data: Record<string, unknown>;
}

export class EliminarCuentaBancariaDto {
    @ApiProperty({ description: 'ID de la cuenta bancaria (gth_cuenta_bancaria_empleado.ide_gtcbe)' })
    @IsInt()
    @Type(() => Number)
    ide_gtcbe: number;
}
