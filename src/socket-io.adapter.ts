import { IoAdapter } from '@nestjs/platform-socket.io';
import { Server, ServerOptions } from 'socket.io';

export class SocketIoAdapter extends IoAdapter {
  private io: Server; // Almacena la instancia de Socket.IO

  createIOServer(port: number, options?: ServerOptions): Server {
    // Configuración personalizada de CORS (como la que ya tenías)
    const corsOptions = {
      origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        const whitelist = [
          'http://localhost:18080',
          'http://192.168.56.103:18080',
          'http://localhost:8080',
          'http://devproerpec.site',
          'https://devproerpec.site',
          'https://proerp.sigafi.com',
          'https://devapi.proialab.com',
        ];
        // Dominios permitidos por patrón (cualquier subdominio o raíz)
        const allowedDomains = [
          /^https?:\/\/([\w-]+\.)?diquimec\.com\.ec$/,
        ];
        if (!origin) return callback(null, true);
        if (whitelist.includes(origin)) return callback(null, true);
        // www.diquimec.com.ec, diquimec.com.ec, sub.diquimec.com.ec…
        if (allowedDomains.some((regex) => regex.test(origin))) return callback(null, true);
        if (
          origin.startsWith('http://localhost:') ||
          origin.startsWith('http://127.0.0.1:') ||
          origin.startsWith('http://192.168.') ||
          origin.startsWith('http://31.220.')
        ) {
          return callback(null, true);
        }
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      },
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
