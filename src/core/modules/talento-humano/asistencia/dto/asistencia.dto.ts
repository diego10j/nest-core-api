import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class GetMisMarcacionesDto {
    @ApiProperty({ description: 'Mes (1-12) a consultar' })
    @IsInt()
    @Min(1)
    @Max(12)
    @Type(() => Number)
    mes: number;

    @ApiProperty({ description: 'Año a consultar' })
    @IsInt()
    @Type(() => Number)
    anio: number;
}
