import { IsNotEmpty, IsString, Length, Matches, MaxLength } from 'class-validator';

import { PASSWORD_CONFIG } from '../constants/password.constants';

export class ForgotPasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Ingrese su correo o usuario' })
  @MaxLength(100)
  identifier: string;
}

export class VerifyResetCodeDto extends ForgotPasswordDto {
  @IsString()
  @Length(6, 6, { message: 'El código tiene 6 dígitos' })
  @Matches(/^\d{6}$/, { message: 'El código tiene 6 dígitos' })
  code: string;
}

export class ResetPasswordWithCodeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  resetToken: string;

  @IsString({ message: 'La nueva contraseña debe ser texto' })
  @IsNotEmpty({ message: 'La nueva contraseña es obligatoria' })
  @MaxLength(PASSWORD_CONFIG.MAX_LENGTH)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d@$!%*?&]{6,}$/, {
    message: 'La nueva contraseña debe tener al menos 6 caracteres, con 1 mayúscula, 1 minúscula y 1 número',
  })
  newPassword: string;

  @IsString()
  @IsNotEmpty({ message: 'La confirmación de contraseña es obligatoria' })
  confirmNewPassword: string;
}
