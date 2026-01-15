import { PartialType } from '@nestjs/mapped-types';
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength, Matches } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class LoginUserDto extends PartialType(QueryOptionsDto) {
  @IsEmail({}, { message: 'El correo electrónico no es válido' })
  email: string;

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
}
