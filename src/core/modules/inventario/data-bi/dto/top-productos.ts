import { IsDateString, IsNumber, IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class TopProductosDto extends QueryOptionsDto {
    @IsDateString()
    fechaInicio: string;

    @IsDateString()
    fechaFin: string;

    @IsNumber()
    @IsOptional()
    limit?: number = 10;
}
