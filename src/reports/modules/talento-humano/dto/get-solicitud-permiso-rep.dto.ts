import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt } from 'class-validator';

export class GetSolicitudPermisoRepDto {
    @ApiProperty({ description: 'ID de la solicitud (asi_permisos_vacacion_hext.ide_aspvh)' })
    @IsInt()
    @Type(() => Number)
    ide_aspvh: number;
}
