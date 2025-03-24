import { IsOptional, IsString } from 'class-validator';

export class FilterDto {
    @IsString()
    column: string;

    @IsString()
    operator: string;

    @IsOptional()
    value: any;
}

