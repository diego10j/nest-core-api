import { IsNumber, IsOptional, IsBoolean } from 'class-validator';
import { RangoFechasDto } from 'src/common/dto/rango-fechas.dto';

export class GetTransaccionesCuentaDto extends RangoFechasDto {

    @IsNumber()
    ideTecba: number;

    @IsOptional()
    @IsBoolean()
    soloNoConciliados?: boolean = false;
}
