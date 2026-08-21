import { Module } from '@nestjs/common';

import { AdminModule } from './admin/admin.module';
import { BaseConocimientoModule } from './base-conocimiento/base-conocimiento.module';
import { CalendarioModule } from './calendario/calendario.module';
import { FilesModule } from './files/files.module';
import { GeneralModule } from './general/general.module';
import { NotificacionesModule } from './notificaciones/notificaciones.module';
import { UsuariosModule } from './usuarios/usuarios.module';

@Module({
  imports: [
    GeneralModule,
    CalendarioModule,
    UsuariosModule,
    AdminModule,
    FilesModule,
    NotificacionesModule,
    BaseConocimientoModule,
  ],
  providers: [],
  exports: [],
  controllers: [],
})
export class SistemaModule {}
