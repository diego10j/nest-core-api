import { IsNumber, IsOptional, IsDateString } from 'class-validator';

export class GetSaldoCuentaDto {

    @IsNumber()
    ideTecba: number;

    @IsOptional()
    @IsDateString()
    fecha?: string;
}
