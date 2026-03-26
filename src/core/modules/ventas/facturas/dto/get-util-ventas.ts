import { ArrayNotEmpty, IsArray, IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive } from 'class-validator';
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
