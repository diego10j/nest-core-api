import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsNumber } from 'class-validator';

export class GetPuestosSalariosByEmpleadoDto {
    @ApiProperty({ description: 'ID del empleado (gth_empleado.ide_gtemp)' })
    @IsInt()
    @Type(() => Number)
    ide_gtemp: number;
}

export class SavePuestoSalarioDto {
    @ApiProperty({ description: 'ID de la asignación (gen_empleados_departamento_par.ide_geedp) — presente solo al actualizar' })
    @IsInt()
    @IsOptional()
    ideGeedp?: number;

    @IsInt() @IsNotEmpty() ideGtemp: number;
    @IsInt() @IsNotEmpty() ideGtcar: number;
    @IsNumber() @IsNotEmpty() rmuGeedp: number;

    @ApiProperty({ description: 'Fecha de inicio de la asignación (YYYY-MM-DD)' })
    @IsNotEmpty()
    fechaGeedp: string;

    @ApiProperty({
        description:
            'Departamento (gen_departamento.ide_gedep) — determina venta/administrativo para la ' +
            'provisión de décimos/fondos de reserva al cerrar el rol.',
    })
    @IsInt()
    @IsNotEmpty()
    ideGedep: number;
}
