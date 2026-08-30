import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt } from 'class-validator';

export class GetRolPagosRepDto {
    @ApiProperty({ description: 'ID del rol de pagos a reportar (nrh_rol.ide_nrrol)' })
    @IsInt()
    @Type(() => Number)
    ide_nrrol: number;
}
