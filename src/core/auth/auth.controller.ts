import { Body, Controller, Get, Ip, Post } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginUserDto } from './dto/login-user.dto';
import { QueryOptionsDto } from '../../common/dto/query-options.dto';
import { Auth, GetUser } from './decorators';
import { HorarioLoginDto } from './dto/horario-login.dto';
import { MenuRolDto } from './dto/menu-rol.dto';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('login')
    login(
        @Body() dtoIn: LoginUserDto, @Ip() ip) {
        return this.authService.login(dtoIn, ip);
    }


    @Get('me')
    @Auth()
    me(
        @GetUser() user: any
    ) {
        return this.authService.checkAuthStatus(user);
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
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: MenuRolDto
    ) {
        return this.authService.getMenuByRol({
            ...headersParams,
            ...dtoIn
        });
    }

    @Post('validarHorarioLogin')
    // @Auth()
    validarHorarioLogin(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: HorarioLoginDto
    ) {
        return this.authService.validarHorarioLogin({
            ...headersParams,
            ...dtoIn
        });
    }




    @Post('logout')
    @Auth()
    logout(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: QueryOptionsDto
    ) {
        return this.authService.logout({
            ...headersParams,
            ...dtoIn
        });
    }

}
