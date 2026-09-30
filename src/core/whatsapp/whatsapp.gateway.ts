import { ModuleRef } from '@nestjs/core';
import { WebSocketGateway, OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { envs } from 'src/config/envs';
import { createSocketAuthMiddleware } from 'src/core/auth/guards/socket-auth.middleware';

@WebSocketGateway(Number(envs.whatsappSocketPort), {
  transports: ['websocket', 'polling'], // Si se requiere polling, de lo contrario solo websocket
})
export class WhatsappGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  constructor(private readonly moduleRef: ModuleRef) {}

  afterInit(server: Server) {
    // Todos los eventos se emiten a todos los sockets: solo deben recibirlos usuarios autenticados.
    server.use(createSocketAuthMiddleware(this.moduleRef, 'whatsapp'));
  }

  handleConnection(client: Socket) {
    console.log(`Cliente conectado: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Cliente desconectado: ${client.id}`);
  }

  sendMessageToClients(message: string) {
    // console.log(`Emit newMessage: : ${message}`);
    this.server.emit('newMessage', message);
  }

  sendReadMessageToClients(message: string) {
    this.server.emit('onReadMessage', message);
  }

  /** Notifica al front cuando el bot se activa o desactiva */
  emitBotStatus(ideWhcue: number, activo: boolean) {
    this.server.emit('botStatus', { ideWhcue, activo });
  }

  /** Notifica a los agentes que el bot generó una proforma */
  emitNuevaProformaBot(ideWhcue: number, secuencial: string, nombreCliente: string) {
    this.server.emit('nuevaProformaBot', { ideWhcue, secuencial, nombreCliente });
  }

  /** Notifica a los agentes que un chat necesita atención humana */
  emitChatEsperandoAsesor(ideWhcue: number, waId: string, ideWhcha: number) {
    this.server.emit('chatEsperandoAsesor', { ideWhcue, waId, ideWhcha });
  }

  /** Emite el total de chats no leídos de una empresa para actualizar el badge del icono */
  emitTotalChatsNoLeidos(ideEmpr: number, total: number) {
    this.server.emit('totalChatsNoLeidos', { ideEmpr, total });
  }
}
