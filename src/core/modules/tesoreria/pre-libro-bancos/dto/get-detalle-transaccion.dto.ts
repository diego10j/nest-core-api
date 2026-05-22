import { IsNumber } from 'class-validator';

export class GetDetalleTransaccionDto {

    @IsNumber()
    ideTeclb: number;
}
