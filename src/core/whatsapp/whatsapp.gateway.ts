import { WebSocketGateway, OnGatewayConnection, OnGatewayDisconnect, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { envs } from 'src/config/envs';

@WebSocketGateway(Number(envs.whatsappSocketPort), { transports: ['websocket'] })
export class WhatsappGateway implements OnGatewayConnection, OnGatewayDisconnect {

    // Este gateway será el encargado de emitir los eventos a los clientes conectados a través de WebSockets.
    @WebSocketServer() server: Server;

    // Cuando un cliente se conecta
    handleConnection(client: Socket) {
        console.log(`Cliente conectado: ${client.id}`);
    }

    // Cuando un cliente se desconecta
    handleDisconnect(client: Socket) {
        console.log(`Cliente desconectado: ${client.id}`);
    }

    // Método para emitir un mensaje a todos los clientes conectados
    sendMessageToClients(message: any) {
        // Emitir el evento 'newMessage' a todos los clientes conectados
        this.server.emit('newMessage', message);
    }
}
