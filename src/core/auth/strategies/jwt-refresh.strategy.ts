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
 *    - Si está revocado pero fue rotado legítimamente (token families) → 401 con code REFRESH_RACE.
 *    - Si está revocado sin vínculo de rotación → posible robo → revoca todos los tokens + 401 con code TOKEN_REUSE.
 *    - Si no existe → token expirado o inválido.
 *    - Si es válido → retorna { id, jti } para que AuthService complete la rotación.
 *
 * El lock contra concurrencia se maneja en AuthService.refreshTokens() — acá solo se valida el estado.
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
            const isRotated = await this.refreshTokenService.isRotatedToken(jti);

            if (isRotated) {
                throw new UnauthorizedException({
                    code: 'REFRESH_RACE',
                    message: 'Refresh token ya fue renovado. Utilice el nuevo token.',
                });
            }

            await this.refreshTokenService.revokeAllForUser(userId);
            throw new UnauthorizedException({
                code: 'TOKEN_REUSE',
                message: 'Refresh token reutilizado. Por seguridad se han cerrado todas las sesiones activas.',
            });
        }

        if (!status.userId) {
            throw new UnauthorizedException('Refresh token expirado o inválido');
        }

        return { id: userId, jti };
    }
}
