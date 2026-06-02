import { IsNumber } from 'class-validator';

export class GetChequesNoConciliadosDto {

    @IsNumber()
    ideTecba: number;
}
