import { Body, Controller, Get, Ip, Post } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginUserDto } from './dto/login-user.dto';
import { ServiceDto } from '../../common/dto/service.dto';
import { Auth, GetUser } from './decorators';
import { HorarioLoginDto } from './dto/horario-login.dto';
import { MenuRolDto } from './dto/menu-rol.dto';

@ApiTags('Auth')
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

    @Post('getMenuByRol')
    @Auth()
    getMenu(
        @Body() serviceDto: MenuRolDto
    ) {
        return this.authService.getMenuByRol(serviceDto);
    }

    @Post('validarHorarioLogin')
    // @Auth()
    validarHorarioLogin(
        @Body() serviceDto: HorarioLoginDto
    ) {
        return this.authService.validarHorarioLogin(serviceDto);
    }




    @Post('logout')
    @Auth()
    logout(
        @Body() serviceDto: ServiceDto
    ) {
        return this.authService.logout(serviceDto);
    }

}
