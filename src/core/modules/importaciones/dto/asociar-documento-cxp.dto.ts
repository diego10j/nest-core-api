import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AsociarDocumentoCxPDto {
    @IsInt()
    @IsNotEmpty()
    ide_imcaim: number;

    @IsInt()
    @IsNotEmpty()
    ide_cpcfa: number;

    @IsString()
    @IsNotEmpty()
    referencia: string;

    @IsString()
    @IsOptional()
    observacion?: string;
}
