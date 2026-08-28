import { IsDateString, IsInt, IsNotEmpty, IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class GetEnviosPorTransporteDto extends QueryOptionsDto {
    @IsInt()
    @IsNotEmpty()
    ide_vgtra: number;

    @IsDateString()
    @IsOptional()
    fechaInicio?: string;

    @IsDateString()
    @IsOptional()
    fechaFin?: string;
}
