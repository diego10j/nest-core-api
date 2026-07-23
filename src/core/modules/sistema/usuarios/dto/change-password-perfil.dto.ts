import { IsNotEmpty, IsString, MaxLength, MinLength, Matches } from 'class-validator';
import { PASSWORD_CONFIG } from 'src/core/auth/constants/password.constants';

export class ChangePasswordPerfilDto {
  @IsString({ message: 'La contraseña actual debe ser texto' })
  @IsNotEmpty({ message: 'La contraseña actual es obligatoria' })
  currentPassword: string;

  @IsString({ message: 'La nueva contraseña debe ser texto' })
  @IsNotEmpty({ message: 'La nueva contraseña es obligatoria' })
  @MinLength(6, { message: 'La nueva contraseña debe tener al menos 6 caracteres' })
  @MaxLength(PASSWORD_CONFIG.MAX_LENGTH, {
    message: `La nueva contraseña no puede exceder ${PASSWORD_CONFIG.MAX_LENGTH} caracteres`,
  })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d@$!%*?&]{6,}$/, {
    message: 'La nueva contraseña debe contener al menos: 1 mayúscula, 1 minúscula y 1 número',
  })
  newPassword: string;

  @IsString({ message: 'La confirmación de contraseña debe ser texto' })
  @IsNotEmpty({ message: 'La confirmación de contraseña es obligatoria' })
  confirmNewPassword: string;
}
