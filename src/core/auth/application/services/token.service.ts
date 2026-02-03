import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { JwtPayload } from '../../interfaces/jwt-payload.interface';

/**
 * Token Service - Responsabilidad Única: Manejo de JWT
 * SRP: Solo se encarga de generar y validar tokens
 */
@Injectable()
export class TokenService {
    constructor(private readonly jwtService: JwtService) { }

    /**
     * Genera un token JWT para el usuario
     */
    generateAccessToken(userId: string): string {
        const payload: JwtPayload = { id: userId };
        return this.jwtService.sign(payload);
    }

    /**
     * Verifica y decodifica un token JWT
     */
    verifyToken(token: string): JwtPayload {
        return this.jwtService.verify<JwtPayload>(token);
    }

    /**
     * Decodifica un token sin verificar su firma
     * Útil para debugging o logs
     */
    decodeToken(token: string): JwtPayload | null {
        return this.jwtService.decode(token) as JwtPayload;
    }
}
