import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';
import { PartialType } from '@nestjs/mapped-types';


export class LoginUserDto extends PartialType(ServiceDto) {

    @IsString()
    @MinLength(3)
    @MaxLength(20)
    userName: string;


    @IsString()
    @MinLength(4)
    @MaxLength(50)
    /** 
    @Matches(
        /(?:(?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
        message: 'The password must have a Uppercase, lowercase letter and a number'
    })*/
    password: string;

}