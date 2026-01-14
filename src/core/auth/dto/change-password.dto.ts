import { IsNotEmpty, IsNumber, IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
    @IsNumber({}, { message: 'El identificador de usuario debe ser un número' })
    @IsNotEmpty({ message: 'El identificador de usuario es obligatorio' })
    ide_usua: number;

    @IsString()
    @IsNotEmpty({ message: 'La contraseña actual es obligatoria' })
    @MinLength(4, { message: 'La contraseña actual debe tener al menos 4 caracteres' })
    @MaxLength(50, { message: 'La contraseña actual no puede exceder 50 caracteres' })
    currentPassword: string;

    @IsString()
    @IsNotEmpty({ message: 'La nueva contraseña es obligatoria' })
    @MinLength(4, { message: 'La nueva contraseña debe tener al menos 4 caracteres' })
    @MaxLength(50, { message: 'La nueva contraseña no puede exceder 50 caracteres' })
    newPassword: string;
}
