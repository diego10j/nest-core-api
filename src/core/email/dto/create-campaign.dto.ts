import { IsNotEmpty, IsOptional, IsString, IsArray, IsDate } from 'class-validator';

export class CreateCampaignDto {
    @IsNotEmpty()
    @IsString()
    nombre: string;

    @IsNotEmpty()
    @IsString()
    asunto: string;

    @IsNotEmpty()
    @IsString()
    contenido: string;

    @IsNotEmpty()
    @IsArray()
    destinatarios: Array<{
        email: string;
        variables?: Record<string, any>;
    }>;

    @IsOptional()
    programacion?: Date;

    @IsOptional()
    ide_corr?: number;
}