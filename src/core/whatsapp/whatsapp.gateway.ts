import { WebSocketGateway, OnGatewayConnection, OnGatewayDisconnect, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { envs } from 'src/config/envs';

@WebSocketGateway(Number(envs.whatsappSocketPort), {
  transports: ['websocket', 'polling'], // Si se requiere polling, de lo contrario solo websocket
})
export class WhatsappGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

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
    // console.log(`Emit onReadMessage: : ${message}`);
    this.server.emit('onReadMessage', message);
  }
}
