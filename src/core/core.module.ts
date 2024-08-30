import { Module } from '@nestjs/common';
import { DataSourceService } from './connection/datasource.service';
import { CoreController } from './core.controller';
import { CoreService } from './core.service';
import { ErrorsModule } from '../errors/errors.module';

import { ChatbotModule } from './chatbot/chatbot.module';
import { SistemaModule } from './sistema/sistema.module';

import { InventarioModule } from './inventario/inventario.module';
import { VentasModule } from './ventas/ventas.module';
@Module({
  imports: [ErrorsModule, ChatbotModule, InventarioModule, SistemaModule, VentasModule],
  providers: [DataSourceService, CoreService],
  exports: [DataSourceService],
  controllers: [CoreController],
})
export class CoreModule { }