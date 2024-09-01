import { PaginationDto } from './pagination.dto';
import {
    IsInt, IsNotEmpty, IsOptional, IsString, MinLength, ValidateNested
} from 'class-validator';
import { Type } from 'class-transformer';


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
    @MinLength(2)
    @IsOptional()
    ip?: string = "127.0.0.1";

    @IsString()
    @MinLength(2)
    @IsOptional()
    device?: string = 'PC';

    @IsOptional()
    @IsNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => PaginationDto)
    pagination?: PaginationDto;
}
