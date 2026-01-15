import { IsNotEmpty, IsNumber, IsString, MaxLength, MinLength, Matches } from 'class-validator';
import { PASSWORD_CONFIG } from '../constants/password.constants';

export class ChangePasswordDto {
    @IsNumber({}, { message: 'El identificador de usuario debe ser un número' })
    @IsNotEmpty({ message: 'El identificador de usuario es obligatorio' })
    ide_usua: number;

    @IsString({ message: 'La contraseña actual debe ser texto' })
    @IsNotEmpty({ message: 'La contraseña actual es obligatoria' })
    @MinLength(PASSWORD_CONFIG.MIN_LENGTH, {
        message: `La contraseña actual debe tener al menos ${PASSWORD_CONFIG.MIN_LENGTH} caracteres`,
    })
    @MaxLength(PASSWORD_CONFIG.MAX_LENGTH, {
        message: `La contraseña actual no puede exceder ${PASSWORD_CONFIG.MAX_LENGTH} caracteres`,
    })
    currentPassword: string;

    @IsString({ message: 'La nueva contraseña debe ser texto' })
    @IsNotEmpty({ message: 'La nueva contraseña es obligatoria' })
    @MinLength(6, { message: 'La nueva contraseña debe tener al menos 6 caracteres' })
    @MaxLength(PASSWORD_CONFIG.MAX_LENGTH, {
        message: `La nueva contraseña no puede exceder ${PASSWORD_CONFIG.MAX_LENGTH} caracteres`,
    })
    @Matches(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d@$!%*?&]{6,}$/,
        {
            message: 'La nueva contraseña debe contener al menos: 1 mayúscula, 1 minúscula y 1 número',
        }
    )
    newPassword: string;
}
