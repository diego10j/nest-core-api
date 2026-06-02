import { IsDateString, IsNumber, IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class UtilidadVentasDto extends QueryOptionsDto {
    @IsDateString()
    fechaInicio: string;

    @IsDateString()
    fechaFin: string;

    @IsNumber()
    @IsOptional()
    ide_sucu: number;
}
