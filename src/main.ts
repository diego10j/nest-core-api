import { ValidationPipe, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Server } from 'socket.io';

import { AppModule } from './app.module';
import { envs } from './config/envs';
import { SocketIoAdapter } from './socket-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: [
      'http://localhost:8080',
      'http://172.21.50.13:8080',
      'http://devproerpec.site',
      'https://devproerpec.site',
    ],
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
  });

  // Configurar el adaptador de WebSockets
  const socketIoAdapter = new SocketIoAdapter(app);
  app.useWebSocketAdapter(socketIoAdapter);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('ERP RESTFul API')
    .setDescription('Erp endpoints')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('doc', app, document);

  await app.listen(envs.port);
  logger.log(`App running on port ${envs.port}`);

  // Manejo de señales para cierre limpio
  const server = app.getHttpServer();
  const io: Server = socketIoAdapter.getIoInstance(); // Obtén la instancia de Socket.IO

  process.on('SIGINT', () => {
    logger.log('Cerrando servidor HTTP y WebSocket...');
    io.close(); // Cierra todas las conexiones WebSocket
    server.close(() => {
      logger.log('Servidor HTTP cerrado');
      process.exit(0);
    });
  });

  process.on('SIGTERM', () => {
    logger.log('Recibida señal SIGTERM');
    io.close();
    server.close(() => {
      logger.log('Servidor HTTP cerrado');
      process.exit(0);
    });
  });
}
bootstrap();
