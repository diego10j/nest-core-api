import { IsDateString, IsInt, IsOptional } from 'class-validator';
import { RangoFechasDto } from 'src/common/dto/rango-fechas.dto';

export class GetDocumentosCxPDto extends RangoFechasDto {

    @IsInt()
    @IsOptional()
    ide_cntdo?: number;
}
