import { IsDateString, IsInt, IsNumber, IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class EvaluacionRotacionProductoDto extends QueryOptionsDto {

    @IsInt()
    ide_inarti: number;

    @IsNumber()
    @IsOptional()
    diasAnalisis?: number = 90;


    @IsDateString()
    @IsOptional()
    fechaCorte?: string;
}
