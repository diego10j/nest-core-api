import { Global, Module } from '@nestjs/common';

import { AlertaSistemaEmitter } from './alerta-sistema.emitter';
import { NotificacionCanalEmitter } from './notificacion-canal.emitter';
import { NotificacionesController } from './notificaciones.controller';
import { NotificacionesGateway } from './notificaciones.gateway';
import { NotificacionesService } from './notificaciones.service';

@Global()
@Module({
  controllers: [NotificacionesController],
  providers: [NotificacionesService, NotificacionesGateway, AlertaSistemaEmitter, NotificacionCanalEmitter],
  exports: [NotificacionesService, NotificacionesGateway, AlertaSistemaEmitter, NotificacionCanalEmitter],
})
export class NotificacionesModule {}
