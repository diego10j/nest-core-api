import { randomUUID } from 'crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { JwtPayload } from '../../interfaces/jwt-payload.interface';

/**
 * TokenService — Generación y verificación de tokens JWT.
 * Access token: corta duración, firmado con JWT_SECRET.
 * Refresh token: larga duración, firmado con JWT_REFRESH_SECRET, incluye JTI único.
 */
@Injectable()
export class TokenService {
    constructor(
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
    ) { }

    generateAccessToken(userId: string): string {
        const payload: JwtPayload = { id: userId };
        return this.jwtService.sign(payload);
    }

    generateRefreshToken(userId: string): string {
        const payload: JwtPayload = { id: userId, jti: randomUUID() };
        return this.jwtService.sign(payload, {
            secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
            expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_TIME') as unknown as number,
        });
    }

    verifyToken(token: string): JwtPayload {
        return this.jwtService.verify<JwtPayload>(token);
    }

    verifyRefreshToken(token: string): JwtPayload {
        return this.jwtService.verify<JwtPayload>(token, {
            secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        });
    }

    decodeToken(token: string): JwtPayload | null {
        return this.jwtService.decode(token) as JwtPayload;
    }
}
