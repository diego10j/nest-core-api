import { IsDateString, IsInt, IsNotEmpty } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

/** Rango de fechas + cliente puntual, para el detalle de un descuadre contable vs CxC. */
export class GetDetalleDiferenciaClienteDto extends QueryOptionsDto {
    @IsDateString()
    @IsNotEmpty()
    fechaInicio: string;

    @IsDateString()
    @IsNotEmpty()
    fechaFin: string;

    @IsInt()
    @IsNotEmpty()
    ide_geper: number;
}
