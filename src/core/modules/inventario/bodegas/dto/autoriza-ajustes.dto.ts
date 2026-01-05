import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';


export class AutorizaAjustesConteoDto {

    @IsInt()
    ide_inccf: number;


    @IsOptional()
    @IsString()
    @MaxLength(200)
    @IsOptional()
    observacion?: string;

}
