import { IsString, IsArray } from 'class-validator';

export class GlobalFilterDto {
    @IsString()
    value: string;

    @IsArray()
    @IsString({ each: true })
    columns: string[];
}