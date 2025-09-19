import { IsNumber, IsOptional, IsString } from "class-validator";

export class AdjuntoCorreoDto {
    @IsString()
    nombre: string;

    @IsString()
    @IsOptional()
    tipoMime?: string;

    @IsNumber()
    tamano: number;

    @IsString()
    ruta: string;

    @IsString()
    @IsOptional()
    contenidoBase64?: string; // Para adjuntos en base64
}