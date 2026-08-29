import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt } from 'class-validator';
import { SaveDto } from 'src/common/dto/save.dto';

export class GetPuestosSalariosByEmpleadoDto {
    @ApiProperty({ description: 'ID del empleado (gth_empleado.ide_gtemp)' })
    @IsInt()
    @Type(() => Number)
    ide_gtemp: number;
}

export class SavePuestoSalarioDto extends SaveDto {
    @ApiProperty({
        description:
            'Datos de gen_empleados_departamento_par. Requeridos al crear: ide_gtemp, ide_gtcar, ' +
            'rmu_geedp, fecha_geedp. El resto de columnas NOT NULL heredadas de sector público ' +
            '(ide_gepgc, ide_gegro, ide_gecaf, ide_geare, ide_gttem, ide_gttco, ide_gttsi, ide_sucu, ' +
            'ide_gedep) deben resolverse con catálogos "genéricos" ya creados para DIQUIMEC.',
    })
    declare data: Record<string, any>;
}
