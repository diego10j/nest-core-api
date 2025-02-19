import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { envs } from './config/envs';
import { SocketIoAdapter } from './socket-io.adapter';



async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: ['http://localhost:8080', 'http://172.21.50.13:8080','http://devproerpec.site'], // Agrega más si es necesario
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

// Configurar el adaptador de WebSockets
app.useWebSocketAdapter(new SocketIoAdapter(app));



  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    })
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
}
bootstrap();
