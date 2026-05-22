import { IsArray, IsDateString, IsNumber } from 'class-validator';

export class ConciliarMovimientosDto {

    @IsArray()
    @IsNumber({}, { each: true })
    ideTeclbList: number[];

    @IsDateString()
    fechaConcilia: string;
}
