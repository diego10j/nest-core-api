import { Injectable } from '@nestjs/common';
import type { Socket } from 'socket.io';

import { AuthService } from '../../auth.service';

import { TokenBlacklistService } from './token-blacklist.service';
import { TokenService } from './token.service';

export interface SocketIdentity {
  ide_usua: number;
  ide_empr: number;
  uuid: string;
  login: string;
}

/**
 * Autentica la conexión de un WebSocket con el mismo access token que usa la API HTTP.
 * El token llega en `handshake.auth.token` (navegador) o en el header Authorization (otros clientes).
 * Mismas reglas que JwtStrategy: firma/expiración válidas, no estar en la blacklist y usuario activo.
 */
@Injectable()
export class SocketAuthService {
  constructor(
    private readonly tokenService: TokenService,
    private readonly blacklist: TokenBlacklistService,
    private readonly auth: AuthService,
  ) {}

  extractToken(socket: Pick<Socket, 'handshake'>): string | undefined {
    const fromAuth = socket.handshake.auth?.token;
    const raw = typeof fromAuth === 'string' ? fromAuth : socket.handshake.headers?.authorization;
    const token = raw?.replace(/^Bearer\s+/i, '').trim();
    return token || undefined;
  }

  async authenticate(socket: Pick<Socket, 'handshake'>): Promise<SocketIdentity> {
    const token = this.extractToken(socket);
    if (!token) throw new Error('Token requerido');

    let payload: { id: string };
    try {
      payload = this.tokenService.verifyToken(token);
    } catch {
      throw new Error('Token inválido o expirado');
    }

    if (await this.blacklist.isTokenBlacklisted(token)) throw new Error('Token inválido o expirado');

    const user = await this.auth.getPwUsuario(payload.id);
    if (!user || user.bloqueado_usua) throw new Error('Usuario no válido o bloqueado');

    return {
      ide_usua: Number(user.ide_usua),
      ide_empr: Number(user.ide_empr),
      uuid: user.uuid,
      login: user.nick_usua,
    };
  }
}
