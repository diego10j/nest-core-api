import {
    IsInt, IsOptional, IsString, MinLength
} from 'class-validator';


export class ServiceDto {

    @IsInt()
    ideUsua: number;

    @IsInt()
    ideEmpr: number;

    @IsInt()
    ideSucu: number;

    @IsInt()
    idePerf: number;

    @IsString()
    @MinLength(4)
    login: string;

    @IsString()
    @MinLength(5)
    ip: string = "127.0.0.1";

    @IsString()
    @MinLength(2)
    @IsOptional()
    device: string = 'PC';

}
