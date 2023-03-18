import { Body, Controller, Get, Ip, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginUserDto } from './dto/login-user.dto';
import { ServiceDto } from '../../common/dto/service.dto';
import { Auth, GetUser } from './decorators';


@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('login')
    login(@Body() loginUserDto: LoginUserDto, @Ip() ip) {
        return this.authService.login(loginUserDto, ip);
    }


    @Get('check-status')
    @Auth()
    checkAuthStatus(
        @GetUser() user: any
    ) {
        return this.authService.checkAuthStatus(user);
    }


    @Post('logout')
    @Auth()
    logout(
        @Body() serviceDto: ServiceDto
    ) {
        return this.authService.logout(serviceDto);
    }

}
