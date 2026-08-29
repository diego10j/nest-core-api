import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt } from 'class-validator';

export class GetSolicitudesByEmpleadoDto {
    @ApiProperty({ description: 'ID del empleado (gth_empleado.ide_gtemp)' })
    @IsInt()
    @Type(() => Number)
    ide_gtemp: number;
}

export class SaveSolicitudMensualizacionDto {
    @ApiProperty({ description: 'ID de la asignación puesto/salario (gen_empleados_departamento_par.ide_geedp)' })
    @IsInt()
    @Type(() => Number)
    ide_geedp: number;

    @ApiProperty({ description: 'ID del rubro (décimo 3 / décimo 4 / fondos de reserva)' })
    @IsInt()
    @Type(() => Number)
    ide_nrrub: number;

    @ApiProperty({ description: 'true = se paga mensualizado; false = se acumula y paga en la fecha legal' })
    @IsBoolean()
    mensualizado_nrsom: boolean;
}
