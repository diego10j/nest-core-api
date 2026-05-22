import { IsNumber, IsString } from 'class-validator';

export class ExisteNumTransaccionDto {

    @IsNumber()
    ideTecba: number;

    @IsNumber()
    ideTettb: number;

    @IsString()
    numero: string;
}
