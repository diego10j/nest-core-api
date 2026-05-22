import { IsDateString, IsOptional, IsNumber, IsInt } from 'class-validator';
import { RangoFechasDto } from 'src/common/dto/rango-fechas.dto';

export class GetImportacionesDto extends RangoFechasDto {

    @IsInt()
    @IsOptional()
    ide_imesor?: number;

    @IsInt()
    @IsOptional()
    ide_geper?: number;
}
