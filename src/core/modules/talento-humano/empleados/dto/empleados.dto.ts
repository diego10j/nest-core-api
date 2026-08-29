import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { SaveDto } from 'src/common/dto/save.dto';

export class GetEmpleadosDto extends QueryOptionsDto {
    @IsIn(['true', 'false'])
    @IsOptional()
    activo?: 'true' | 'false';
}

export class GetEmpleadoByIdDto {
    @ApiProperty({ description: 'ID del empleado (gth_empleado.ide_gtemp)' })
    @IsInt()
    @Type(() => Number)
    ide_gtemp: number;
}

export class SaveEmpleadoDto extends SaveDto {
    @ApiProperty({
        description:
            'Datos combinados de gen_persona (identidad/contacto) y gth_empleado (ficha RRHH). ' +
            'Requeridos al crear: primer_nombre_gtemp, apellido_paterno_gtemp, documento_identidad_gtemp, ' +
            'fecha_nacimiento_gtemp, ide_gtgen, ide_gttdi, ide_gtesc, ide_gttis, ide_gtnac, ide_gedip.',
    })
    declare data: Record<string, any>;
}
