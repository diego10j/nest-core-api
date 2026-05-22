import { IsNumber, IsString, IsOptional, IsDateString } from 'class-validator';

export class ReversarTransaccionDto {

    @IsNumber()
    ideTeclb: number;

    @IsString()
    @IsOptional()
    observacion?: string;

    @IsString()
    @IsOptional()
    numero?: string;

    @IsString()
    @IsOptional()
    beneficiario?: string;

    @IsDateString()
    @IsOptional()
    fecha?: string;
}
