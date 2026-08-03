import { IsNumber } from 'class-validator';
import { RangoFechasDto } from 'src/common/dto/rango-fechas.dto';

export class GetTransaccionesCuentaKPIDto extends RangoFechasDto {

    @IsNumber()
    ideTecba: number;
}
