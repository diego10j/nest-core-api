import { Body, Controller, Get, Ip, Post, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { AuthService } from './auth.service';
import { Auth, GetUser } from './decorators';
import { ChangePasswordDto } from './dto/change-password.dto';
import { HorarioLoginDto } from './dto/horario-login.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { MenuRolDto } from './dto/menu-rol.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AuthUser } from './interfaces';

/**
 * Auth Controller - Implementa Clean Architecture con SOLID
 * 
 * ✅ Refactorizado aplicando principios SOLID
 * ✅ Usa AuthService que orquesta Use Cases
 * ✅ Endpoints optimizados y documentados
 * ✅ Rate limiting implementado
 * ✅ Protección contra fuerza bruta
 */
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
  ) { }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 intentos por minuto
  @ApiOperation({ summary: 'Login de usuario' })
  @ApiResponse({ status: 200, description: 'Login exitoso' })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas' })
  @ApiResponse({ status: 429, description: 'Demasiados intentos. Intente más tarde' })
  login(@Body() dtoIn: LoginUserDto, @Ip() ip: string) {
    return this.authService.login(dtoIn, ip);
  }

  @Get('me')
  @Auth()
  @ApiOperation({ summary: 'Obtener usuario actual' })
  me(@GetUser() user: AuthUser) {
    return this.authService.checkAuthStatus(user);
  }

  @Get('check-status')
  @Auth()
  @ApiOperation({ summary: 'Verificar estado de autenticación' })
  checkAuthStatus(@GetUser() user: AuthUser) {
    return this.authService.checkAuthStatus(user);
  }

  @Post('getMenuByRol')
  @Auth()
  @ApiOperation({ summary: 'Obtener menú por rol/perfil' })
  getMenu(@Body() dtoIn: MenuRolDto) {
    return this.authService.getMenuByRol(dtoIn);
  }

  @Post('validarHorarioLogin')
  @ApiOperation({ summary: 'Validar horario de login por perfil' })
  validarHorarioLogin(@Body() dtoIn: HorarioLoginDto) {
    return this.authService.validarHorarioLogin(dtoIn);
  }

  @Post('logout')
  @Auth()
  @ApiOperation({ summary: 'Cerrar sesión' })
  @ApiResponse({ status: 200, description: 'Sesión cerrada exitosamente' })
  logout(
    @Headers('authorization') authorization: string,
    @AppHeaders() headersParams: HeaderParamsDto,
    @GetUser() user: AuthUser
  ) {
    // Extraer token del header Authorization
    const token = authorization?.replace('Bearer ', '') || '';

    return this.authService.logout(
      user.ide_usua,
      headersParams.ip,
      token,
      headersParams.device,
    );
  }

  @Post('changePassword')
  @Auth()
  @ApiOperation({ summary: 'Cambiar contraseña' })
  @ApiResponse({ status: 200, description: 'Contraseña cambiada exitosamente' })
  @ApiResponse({ status: 401, description: 'Contraseña actual incorrecta' })
  changePassword(@Body() dtoIn: ChangePasswordDto, @GetUser('id') userId: string) {
    return this.authService.changePassword(dtoIn, userId);
  }

  @Post('resetPassword')
  @Auth()
  @ApiOperation({ summary: 'Resetear contraseña de un usuario a valor por defecto' })
  @ApiResponse({ status: 200, description: 'Contraseña reseteada exitosamente' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  resetPassword(@Body() dtoIn: ResetPasswordDto) {
    return this.authService.resetPassword(dtoIn);
  }
}
