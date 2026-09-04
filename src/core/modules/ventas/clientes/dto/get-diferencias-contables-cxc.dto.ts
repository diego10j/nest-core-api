import { IsDateString, IsNotEmpty } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

/** Fecha de corte para conciliar el saldo contable de la cuenta Clientes contra CxC. */
export class GetDiferenciasContablesCxcDto extends QueryOptionsDto {
    @IsDateString()
    @IsNotEmpty()
    fechaCorte: string;
}
