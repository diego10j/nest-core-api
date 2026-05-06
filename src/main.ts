import { ValidationPipe, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import { Server } from 'socket.io';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { envs } from './config/envs';
import { SocketIoAdapter } from './socket-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix('api');

  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
  }));

  app.enableCors({
    origin: [
      'http://localhost:18080',
      'http://192.168.56.103:18080',
      'http://devproerpec.site',
      'https://devproerpec.site',
      'https://proerp.sigafi.com',
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
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
      'X-Device',
    ],
    exposedHeaders: [
      'Content-Disposition',
      'Authorization',
      'X-Ide-Usua',
      'X-Ide-Empr',
      'X-Ide-Sucu',
      'X-Ide-Perf',
      'X-Login',
    ],
    credentials: true,
  });

  const socketIoAdapter = new SocketIoAdapter(app);
  app.useWebSocketAdapter(socketIoAdapter);

  app.use(json({ limit: '100mb' }));
  app.use(urlencoded({ extended: true, limit: '100mb' }));

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
    .setDescription('API RESTful para el sistema Pro-ERP. Incluye autenticación JWT, gestión de ventas, inventario, contabilidad, cuentas por cobrar/pagar, SRI electrónico, WhatsApp, email y reportes PDF.\n\n## Autenticación\n- Login: `POST /api/auth/login` → retorna `accessToken` (15min) y `refreshToken` (7d)\n- Refresh: `POST /api/auth/refresh` con header `Authorization: Bearer <refreshToken>`\n- Usar `accessToken` en header `Authorization: Bearer <accessToken>` para endpoints protegidos\n\n## Headers Multi-Tenant (obligatorios en todos los endpoints)\n- `X-Ide-Usua`: ID usuario (number)\n- `X-Ide-Empr`: ID empresa (number)\n- `X-Ide-Sucu`: ID sucursal (number)\n- `X-Ide-Perf`: ID perfil/rol (number)\n- `X-Login`: Login del usuario (string)\n- `X-Ip`: IP del cliente (string, opcional)\n- `X-Terminal`: Identificador del terminal (string, opcional)\n- `X-Device`: Identificador del dispositivo (string, opcional)')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'JWT Access Token (formato: Bearer <token>)',
        in: 'header',
      },
      'BearerAuth',
    )
    .addTag('Auth', 'Autenticación y gestión de sesiones')
    .addTag('Sistema', 'Usuarios, archivos, configuración general')
    .addTag('Ventas', 'Facturación, clientes, punto de venta, BI')
    .addTag('Inventario', 'Productos, bodegas, etiquetas, menudeo')
    .addTag('Proformas', 'Gestión de proformas y cotizaciones')
    .addTag('Sri', 'Comprobantes electrónicos y firma digital')
    .addTag('Tesoreria', 'Cuentas bancarias y transacciones')
    .addTag('Contabilidad', 'Plan de cuentas, libros contables, estados financieros')
    .addTag('CuentasPorCobrar', 'Gestión de cartera de clientes')
    .addTag('CuentasPorPagar', 'Gestión de obligaciones con proveedores')
    .addTag('Reports', 'Generación de reportes PDF')
    .addTag('WhatsApp', 'Integración con WhatsApp Cloud API')
    .addTag('Email', 'Envío de emails y campañas')
    .addTag('Charts', 'Datos para gráficos y visualizaciones')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'list',
      filter: true,
      showRequestDuration: false,
      supportedSubmitMethods: ['get', 'post', 'put', 'delete', 'patch'],
    },
    customSiteTitle: 'Pro-ERP API Docs',
  });

  await app.listen(envs.port);
  logger.log(`App running on port ${envs.port}`);
  logger.log(`Swagger docs: http://${envs.HOST_API}/docs`);

  const server = app.getHttpServer();
  const io: Server = socketIoAdapter.getIoInstance();

  process.on('SIGINT', () => {
    logger.log('Cerrando servidor HTTP y WebSocket...');
    io.close();
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
