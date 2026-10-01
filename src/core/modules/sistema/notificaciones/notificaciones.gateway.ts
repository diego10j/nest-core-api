import { ModuleRef } from '@nestjs/core';
import {
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import { envs } from 'src/config/envs';
import { createSocketAuthMiddleware } from 'src/core/auth/guards/socket-auth.middleware';

export interface NotificacionPayload {
  uuid: string;
  ideNoti: number;
  codigoNoti: string;
  iconoNoti: string;
  colorNoti: string;
  tituloMeno: string;
  mensajeMeno: string;
  contenidoMeno: Record<string, unknown> | null;
  botonesMeno: Array<Record<string, unknown>>;
  moduloNoti: string;
  fechaEnvioMeno: string;
}

export interface BadgePayload {
  totalNoLeidas: number;
}

@WebSocketGateway(Number(envs.whatsappSocketPort), {
  namespace: '/notificaciones',
  transports: ['websocket', 'polling'],
})
export class NotificacionesGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer()
  server: Namespace;

  constructor(private readonly moduleRef: ModuleRef) {}

  afterInit(server: Namespace) {
    server.use(createSocketAuthMiddleware(this.moduleRef, 'notificaciones'));
  }

  handleConnection(client: Socket) {
    // La sala sale del token verificado, nunca de lo que declare el cliente.
    // Solo en modo 'warn' (rollout) se tolera el ide_usua declarado por clientes sin token.
    let ideUsua: number | undefined = client.data.user?.ide_usua;
    if (ideUsua == null && envs.authGuardMode === 'warn') {
      const declared = Number(client.handshake.auth?.ide_usua);
      if (Number.isFinite(declared)) ideUsua = declared;
    }
    if (ideUsua != null) {
      client.join(`usua:${ideUsua}`);
    }
  }

  emitirAUsuario(ideUsua: number, payload: NotificacionPayload) {
    this.server.to(`usua:${ideUsua}`).emit('nueva_notificacion', payload);
  }

  emitirBadge(ideUsua: number, payload: BadgePayload) {
    this.server.to(`usua:${ideUsua}`).emit('badge_actualizado', payload);
  }
}
