import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ConfigPasswordDto {



    @IsInt()
    @IsOptional()
    ide_uscl?: number;  // si viene valor Actualiza, si no viene crea nuevo

    @IsInt()
    ide_usua: number;

    @IsInt()
    @IsOptional()
    ide_pecl?: number;

    @IsDateString()
    @IsOptional()
    fecha_vence_uscl?: String;

    /**
     * Opcional. Si no viene al crear la configuración, el sistema genera una contraseña temporal
     * aleatoria y la envía al correo registrado del usuario (ya no existe una clave por defecto).
     */
    @IsString()
    @IsOptional()
    @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
    @MaxLength(80, { message: 'La contraseña no puede exceder 80 caracteres' })
    password_uscl?: string;

    @IsBoolean()
    @IsOptional()
    activo_uscl?: boolean = true;

}
