import { Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { Socket } from 'socket.io';

import { envs } from '../../../config/envs';
import { SocketAuthService, SocketIdentity } from '../application/services/socket-auth.service';

type Next = (err?: Error) => void;

/**
 * Middleware de socket.io que autentica el handshake y deja la identidad en `socket.data.user`.
 *
 * - enforce (AUTH_GUARD_MODE por defecto): sin token válido la conexión se rechaza (`unauthorized`).
 * - warn: deja conectar y solo registra el rechazo, para no romper clientes que aún no envían token
 *   (`socket.data.user` queda undefined).
 *
 * El servicio se resuelve perezosamente con ModuleRef (strict:false) para no crear un import
 * circular entre los módulos de los gateways y AuthModule.
 */
export function createSocketAuthMiddleware(moduleRef: ModuleRef, context: string) {
  const logger = new Logger(`SocketAuth:${context}`);

  return async (socket: Socket, next: Next): Promise<void> => {
    try {
      const svc = moduleRef.get(SocketAuthService, { strict: false });
      const identity: SocketIdentity = await svc.authenticate(socket);
      socket.data.user = identity;
      next();
    } catch (error) {
      const reason = (error as Error).message;
      if (envs.authGuardMode === 'warn') {
        logger.warn(`[warn-mode] ${socket.id} conecta sin token válido (${reason}); se permitiría rechazar`);
        next();
        return;
      }
      logger.warn(`Conexión rechazada ${socket.id}: ${reason}`);
      next(new Error('unauthorized'));
    }
  };
}
