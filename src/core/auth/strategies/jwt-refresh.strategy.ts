import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { RefreshTokenService } from '../application/services/refresh-token.service';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * JwtRefreshStrategy — Valida el refresh token enviado en el body (campo "refreshToken").
 *
 * Proceso:
 * 1. Verifica firma con JWT_REFRESH_SECRET.
 * 2. Comprueba el JTI en Redis:
 *    - Si está revocado → posible ataque de reuso → invalida todos los tokens del usuario.
 *    - Si no existe → token expirado o inválido.
 *    - Si es válido → retorna { id, jti } para que AuthService complete la rotación.
 */
@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
    constructor(
        configService: ConfigService,
        private readonly refreshTokenService: RefreshTokenService,
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
            secretOrKey: configService.get<string>('JWT_REFRESH_SECRET'),
            ignoreExpiration: false,
            passReqToCallback: false,
        });
    }

    async validate(payload: JwtPayload): Promise<{ id: string; jti: string }> {
        const { id: userId, jti } = payload;

        if (!jti) {
            throw new UnauthorizedException('Refresh token inválido');
        }

        const status = await this.refreshTokenService.getStatus(jti);

        if (status.isRevoked) {
            // Token revocado reutilizado → posible robo de token → invalidar todo
            await this.refreshTokenService.revokeAllForUser(userId);
            throw new UnauthorizedException(
                'Refresh token reutilizado. Por seguridad se han cerrado todas las sesiones activas.',
            );
        }

        if (!status.userId) {
            throw new UnauthorizedException('Refresh token expirado o inválido');
        }

        return { id: userId, jti };
    }
}
