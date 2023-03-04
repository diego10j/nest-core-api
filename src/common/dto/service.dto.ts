import {
    IsIn, IsOptional, IsString, MinLength
} from 'class-validator';


export class ServiceDto {

    @IsString()
    @MinLength(1)
    ide_usua: string;

    @IsString()
    @MinLength(1)
    ide_empr: string;

    @IsString()
    @MinLength(1)
    ide_sucu: string;

    @IsString()
    @MinLength(4)
    login: string;

    @IsString()
    @MinLength(5)
    ip: string = "127.0.0.1";

    @IsString()
    @MinLength(2)
    @IsOptional()
    @IsIn(['PC', 'MOVIL'])
    device: string = 'PC';

}
