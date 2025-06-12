import { IsString, IsArray, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

export class GlobalFilterDto {
    @IsString()
    value: string;

    @Transform(({ value }) => {
        // Si ya es un array, lo dejamos igual
        if (Array.isArray(value)) return value;
        // Si es un string, lo dividimos por comas y eliminamos espacios
        if (typeof value === 'string') {
            return value.split(',').map(col => col.trim()).filter(col => col.length > 0);
        }
        // Para otros casos devolvemos un array vacío
        return [];
    })
    @IsArray()
    @IsString({ each: true })
    columns: string[];
}