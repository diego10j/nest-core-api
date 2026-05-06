import { PartialType } from '@nestjs/mapped-types';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength, Matches, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class LoginUserDto extends PartialType(QueryOptionsDto) {
  @ApiPropertyOptional({ description: 'Correo electrónico del usuario', example: 'admin@sigafi.com' })
  @IsOptional()
  @IsEmail({}, { message: 'El correo electrónico no es válido' })
  @ValidateIf((o) => !o.login || o.email)
  email?: string;

  @ApiPropertyOptional({ description: 'Login del usuario', example: 'admin' })
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'El login debe tener al menos 3 caracteres' })
  @MaxLength(50, { message: 'El login no puede exceder 50 caracteres' })
  @ValidateIf((o) => !o.email || o.login)
  login?: string;

  @ApiProperty({ description: 'Contraseña (mín 6 chars, 1 mayúscula, 1 minúscula, 1 número)', example: 'Admin123@' })
  @IsString()
  @IsNotEmpty({ message: 'La contraseña es obligatoria' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  @MaxLength(50)
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d@$!%*?&]{6,}$/,
    {
      message: 'La contraseña debe contener al menos: 1 mayúscula, 1 minúscula y 1 número',
    }
  )
  password: string;

  /**
   * Obtiene el identificador de usuario (email o login)
   */
  getIdentifier(): string {
    if (!this.email && !this.login) {
      throw new Error('Debe proporcionar email o login');
    }
    return this.email || this.login;
  }
}
