import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';
import { PartialType } from '@nestjs/mapped-types';


export class LoginUserDto extends PartialType(ServiceDto) {

    @IsEmail({}, { message: 'El correo electrónico no es válido' })
    email: string;


    @IsString()
    @IsNotEmpty({ message: 'La contraseña es obligatoria' })
    @MinLength(4)
    @MaxLength(50)
    /** 
    @Matches(
        /(?:(?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
        message: 'The password must have a Uppercase, lowercase letter and a number'
    })*/
    password: string;

}