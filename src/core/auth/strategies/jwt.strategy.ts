import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';

import { fToTitleCase } from '../../../util/helpers/string-util';
import { AuthService } from '../auth.service';
import { TokenBlacklistService } from '../application/services/token-blacklist.service';
import { JwtPayload, AuthUser } from '../interfaces';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly auth: AuthService,
    private readonly tokenBlacklistService: TokenBlacklistService,
  ) {
    super({
      secretOrKey: configService.get('JWT_SECRET'),
      ignoreExpiration: false,
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      passReqToCallback: true, // Necesario para acceder al request
    });
  }

  async validate(request: Request, payload: JwtPayload): Promise<AuthUser> {
    const { id } = payload;

    // 1. Extraer token del header
    const token = request.headers.authorization?.replace('Bearer ', '') || '';

    // 2. Verificar si el token está en blacklist
    const isBlacklisted = await this.tokenBlacklistService.isTokenBlacklisted(token);
    if (isBlacklisted) {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    // 3. Validar usuario
    const dataUser = await this.auth.getPwUsuario(id);

    if (!dataUser) {
      throw new UnauthorizedException('Token no válido');
    }

    if (dataUser.bloqueado_usua) {
      throw new UnauthorizedException('Usuario bloqueado, contactese con el administrador del sistema.');
    }

    // Obtener perfiles y sucursales del usuario
    const dataPerf = await this.auth.getPerfilesUsuario(dataUser.ide_usua);
    const dataSucu = await this.auth.getSucursalesUsuario(dataUser.ide_usua);
    const roles = dataPerf.map((perf) => perf.ide_perf?.toString()).filter((id) => id != null);

    const user: AuthUser = {
      ide_usua: Number.parseInt(dataUser.ide_usua),
      id: dataUser.uuid,
      displayName: fToTitleCase(dataUser.nom_usua),
      email: dataUser.mail_usua,
      login: dataUser.nick_usua,
      photoURL: `${this.configService.get('HOST_API')}/assets/images/avatars/${dataUser.avatar_usua}`,
      isPublic: dataUser.cambia_clave_usua,
      lastAccess: dataUser.fecha_auac,
      ip: dataUser.ip_auac,
      requireChange: dataUser.cambia_clave_usua,
      isSuperUser: dataUser.admin_usua,
      perfiles: dataPerf,
      sucursales: dataSucu,
      empresas: [
        {
          ide_empr: Number.parseInt(dataUser.ide_empr),
          nom_empr: dataUser.nom_empr,
          logo_empr: dataUser.logotipo_empr,
          identificacion_empr: dataUser.identificacion_empr,
        },
      ],
      roles,
    };

    return user;
  }
}
