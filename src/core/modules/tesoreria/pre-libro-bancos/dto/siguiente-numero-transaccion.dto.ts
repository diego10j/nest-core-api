import { IsNumber } from 'class-validator';

export class SiguienteNumeroTransaccionDto {

    @IsNumber()
    ideTecba: number;

    @IsNumber()
    ideTettb: number;
}
