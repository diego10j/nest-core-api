import { IoAdapter } from '@nestjs/platform-socket.io';
import { Server, ServerOptions } from 'socket.io';

export class SocketIoAdapter extends IoAdapter {
  private io: Server; // Almacena la instancia de Socket.IO

  createIOServer(port: number, options?: ServerOptions): Server {
    // Configuración personalizada de CORS (como la que ya tenías)
    const corsOptions = {
      origin: ['http://localhost:8080', 'http://172.21.50.13:8080', 'http://devproerpec.site'],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Agregué métodos comunes
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Ide-Usua',
        'X-Ide-Empr',
        'X-Ide-Sucu',
        'X-Ide-Perf',
        'X-Login',
        'X-Ip',
        'X-Terminal',
      ],
      exposedHeaders: ['Authorization', 'X-Ide-Usua', 'X-Ide-Empr', 'X-Ide-Sucu', 'X-Ide-Perf', 'X-Login'],
      credentials: true,
    };

    this.io = super.createIOServer(port, {
      ...options,
      cors: corsOptions,
    });

    return this.io;
  }

  // Método para obtener la instancia de Socket.IO y cerrarla adecuadamente
  getIoInstance(): Server {
    return this.io;
  }
}
