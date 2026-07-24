import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, ValidateNested } from 'class-validator';

export class PersonaUpdateItem {
    @IsInt()
    @IsNotEmpty()
    ideGeper: number;

    @IsBoolean()
    @IsOptional()
    esCliente?: boolean;

    @IsBoolean()
    @IsOptional()
    esProveedor?: boolean;

    @IsBoolean()
    @IsOptional()
    esEmpleado?: boolean;

    @IsBoolean()
    @IsOptional()
    activo?: boolean;
}

export class SavePersonasDto {
    @ValidateNested({ each: true })
    @Type(() => PersonaUpdateItem)
    @IsNotEmpty()
    personas: PersonaUpdateItem[];
}
