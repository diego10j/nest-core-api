import { BadRequestException, Body, Controller, Get, Ip, Post, Headers, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { AuthService } from './auth.service';
import { Auth, GetUser } from './decorators';
import { ChangePasswordDto } from './dto/change-password.dto';
import { HorarioLoginDto } from './dto/horario-login.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { LogoutDto } from './dto/logout.dto';
import { MenuRolDto } from './dto/menu-rol.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { AuthUser } from './interfaces';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Login de usuario',
    description: 'Autentica usuario con email/login y contraseña. Retorna accessToken (15min) y refreshToken (7d). Limitado a 5 intentos por minuto.',
  })
  @ApiResponse({ status: 200, description: 'Login exitoso', type: Object })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas' })
  @ApiResponse({ status: 429, description: 'Demasiados intentos. Intente más tarde' })
  login(@Body() dtoIn: LoginUserDto, @Ip() ip: string) {
    return this.authService.login(dtoIn, ip);
  }

  @Post('refresh')
  @UseGuards(JwtRefreshGuard)
  @ApiOperation({ summary: 'Renovar access token', description: 'Usa refresh token (rotación) para obtener nuevos tokens. El refresh token anterior es invalidado.' })
  @ApiResponse({ status: 200, description: 'Nuevos accessToken y refreshToken' })
  @ApiResponse({ status: 401, description: 'Refresh token inválido, expirado o reutilizado' })
  refresh(@Req() req: any) {
    const { id: userId, jti } = req.user as { id: string; jti: string };
    return this.authService.refreshTokens(userId, jti);
  }

  @Get('me')
  @Auth()
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: 'Obtener datos del usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Datos del usuario' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  me(@GetUser() user: AuthUser) {
    return this.authService.checkAuthStatus(user);
  }

  @Get('check-status')
  @Auth()
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: 'Verificar estado de autenticación' })
  @ApiResponse({ status: 200, description: 'Estado de autenticación válido' })
  checkAuthStatus(@GetUser() user: AuthUser) {
    return this.authService.checkAuthStatus(user);
  }

  @Post('getMenuByRol')
  @Auth()
  @ApiBearerAuth('BearerAuth')
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
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: 'Cerrar sesión', description: 'Invalida access token y revoca refresh token' })
  @ApiResponse({ status: 200, description: 'Sesión cerrada exitosamente' })
  logout(
    @Headers('authorization') authorization: string,
    @AppHeaders() headersParams: HeaderParamsDto,
    @GetUser() user: AuthUser,
    @Body() body: LogoutDto,
  ) {
    const accessToken = authorization?.replace('Bearer ', '') || '';
    return this.authService.logout(
      user.ide_usua,
      headersParams.ip,
      accessToken,
      body.refreshToken,
      headersParams.device,
    );
  }

  @Post('changePassword')
  @Auth()
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: 'Cambiar contraseña', description: 'Invalida todos los tokens activos del usuario' })
  @ApiResponse({ status: 200, description: 'Contraseña cambiada exitosamente' })
  @ApiResponse({ status: 401, description: 'Contraseña actual incorrecta' })
  changePassword(@Body() dtoIn: ChangePasswordDto, @GetUser() user: AuthUser) {
    if (dtoIn.newPassword !== dtoIn.confirmNewPassword) {
      throw new BadRequestException('La nueva contraseña y la confirmación no coinciden');
    }
    return this.authService.changePassword(dtoIn, user.ide_usua, user.id);
  }

  @Post('resetPassword')
  @Auth()
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: 'Resetear contraseña', description: 'Resetea contraseña de usuario a valor por defecto (solo admins)' })
  @ApiResponse({ status: 200, description: 'Contraseña reseteada' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  resetPassword(@Body() dtoIn: ResetPasswordDto) {
    return this.authService.resetPassword(dtoIn);
  }
}
