import { IsDateString, IsInt, IsNotEmpty } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

/** Fecha de corte + cliente puntual, para el detalle de un descuadre contable vs CxC. */
export class GetDetalleDiferenciaClienteDto extends QueryOptionsDto {
    @IsDateString()
    @IsNotEmpty()
    fechaCorte: string;

    @IsInt()
    @IsNotEmpty()
    ide_geper: number;
}
