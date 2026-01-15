import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PASSWORD_CONFIG } from 'src/core/auth/constants/password.constants';

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

    @IsString()
    @IsOptional()
    @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
    @MaxLength(80, { message: 'La contraseña no puede exceder 80 caracteres' })
    password_uscl: string = PASSWORD_CONFIG.DEFAULT_PASSWORD;

    @IsBoolean()
    @IsOptional()
    activo_uscl?: boolean = true;

}
