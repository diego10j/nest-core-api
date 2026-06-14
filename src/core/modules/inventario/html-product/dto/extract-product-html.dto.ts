import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ExtractProductHtmlDto {
    @IsInt()
    @IsOptional()
    ideInarti?: number;

    @IsString()
    @IsNotEmpty()
    html: string;

    @IsString()
    @IsOptional()
    url?: string;
}
