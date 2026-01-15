import { Body, Controller, Get, Ip, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { QueryOptionsDto } from '../../common/dto/query-options.dto';

import { AuthService } from './auth.service';
import { Auth, GetUser } from './decorators';
import { ChangePasswordDto } from './dto/change-password.dto';
import { HorarioLoginDto } from './dto/horario-login.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { MenuRolDto } from './dto/menu-rol.dto';
import { AuthUser } from './interfaces';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post('login')
  login(@Body() dtoIn: LoginUserDto, @Ip() ip) {
    return this.authService.login(dtoIn, ip);
  }

  @Get('me')
  @Auth()
  me(@GetUser() user: AuthUser) {
    return this.authService.checkAuthStatus(user);
  }

  @Get('check-status')
  @Auth()
  checkAuthStatus(@GetUser() user: AuthUser) {
    return this.authService.checkAuthStatus(user);
  }

  @Post('getMenuByRol')
  @Auth()
  getMenu(@Body() dtoIn: MenuRolDto) {
    return this.authService.getMenuByRol(dtoIn);
  }

  @Post('validarHorarioLogin')
  // @Auth()
  validarHorarioLogin(@Body() dtoIn: HorarioLoginDto) {
    return this.authService.validarHorarioLogin(dtoIn);
  }

  @Post('logout')
  @Auth()
  logout(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: QueryOptionsDto) {
    return this.authService.logout({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('changePassword')
  @Auth()
  changePassword(@Body() dtoIn: ChangePasswordDto) {
    return this.authService.changePassword(dtoIn);
  }
}
