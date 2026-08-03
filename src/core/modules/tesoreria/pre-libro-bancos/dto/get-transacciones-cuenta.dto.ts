import { IsNumber, IsOptional, IsBoolean, Min, Max } from 'class-validator';
import { RangoFechasDto } from 'src/common/dto/rango-fechas.dto';

export class GetTransaccionesCuentaDto extends RangoFechasDto {

    @IsNumber()
    ideTecba: number;

    @IsOptional()
    @IsBoolean()
    soloNoConciliados?: boolean = false;

    @IsOptional()
    @IsNumber()
    @Min(1)
    @Max(2)
    modo?: number = 1;
}
