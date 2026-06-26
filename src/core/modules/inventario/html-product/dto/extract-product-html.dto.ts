import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

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

    @IsIn(['true', 'false'])
    @IsOptional()
    @Transform(({ value }) => value === 'true')
    soloImagen?: boolean;

    @IsIn(['true', 'false'])
    @IsOptional()
    @Transform(({ value }) => value === 'true')
    soloTexto?: boolean;
}
