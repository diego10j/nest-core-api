import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { envs } from 'src/config/envs';

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
export class NotificacionesGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    const ideUsua = client.handshake.auth?.ide_usua;
    if (ideUsua != null) {
      client.join(`usua:${ideUsua}`);
    }
  }

  handleDisconnect(client: Socket) {
    const ideUsua = client.handshake.auth?.ide_usua;
    if (ideUsua != null) {
      client.leave(`usua:${ideUsua}`);
    }
  }

  emitirAUsuario(ideUsua: number, payload: NotificacionPayload) {
    this.server.to(`usua:${ideUsua}`).emit('nueva_notificacion', payload);
  }

  emitirBadge(ideUsua: number, payload: BadgePayload) {
    this.server.to(`usua:${ideUsua}`).emit('badge_actualizado', payload);
  }
}
