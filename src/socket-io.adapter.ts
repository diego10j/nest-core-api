import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';

export class SocketIoAdapter extends IoAdapter {
  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, {
      ...options,
      cors: {
        origin: ['http://localhost:8080','http://172.21.50.13:8080', 'http://devproerpec.site'], // Agrega aquí los orígenes permitidos
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true, // Permitir cookies si las usas en WebSockets
      },
    });
    return server;
  }
}
