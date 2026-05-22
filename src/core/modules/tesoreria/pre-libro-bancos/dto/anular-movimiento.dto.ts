import { IsNumber } from 'class-validator';

export class AnularMovimientoDto {

    @IsNumber()
    ideTeclb: number;
}
