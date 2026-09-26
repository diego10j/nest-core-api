import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProformasReportsModule } from 'src/reports/modules/proformas/proformas-reports.module';
import { VentasReportsModule } from 'src/reports/modules/ventas/ventas-reports.module';

import { CoreService } from '../../core.service';
import { AuditService } from '../audit/audit.service';
import { BaseTecnicaModule } from '../base-tecnica/base-tecnica.module';
import { ConfigPreciosProductosService } from '../inventario/productos/config-precios.service';
import { ProductosService } from '../inventario/productos/productos.service';
import { VentasModule } from '../ventas/ventas.module';

import { QuimiaConocimientoService } from './conocimiento/quimia-conocimiento.service';
import { QuimiaDocumentosErpService } from './erp/quimia-documentos-erp.service';
import { QuimiaAgenteService } from './quimia-agente.service';
import { QuimiaClientesService } from './quimia-clientes.service';
import { QuimiaHerramientasService } from './quimia-herramientas.service';
import { QuimiaProductosService } from './quimia-productos.service';
import { QuimiaController } from './quimia.controller';
import { TelegramApiService } from './telegram/telegram-api.service';
import { TelegramBotService } from './telegram/telegram-bot.service';
import { TelegramCuentaService } from './telegram/telegram-cuenta.service';
import { TelegramRunnerService } from './telegram/telegram-runner.service';
import { TelegramController } from './telegram/telegram.controller';
import { TranscripcionService } from './transcripcion/transcripcion.service';

/**
 * Asistente QuimIA: responde consultas de productos combinando la base técnica (documentos) con datos
 * del ERP (stock, proveedores, compras, precios, clientes) mediante herramientas de IA.
 *
 * El núcleo (QuimiaAgenteService) no depende del canal: el chat web usa /quimia/chat (streaming) y
 * cualquier integración usa /quimia/preguntar (JSON con textoPlano y links). El bot de Telegram
 * (carpeta telegram/) usa el mismo núcleo, con números autorizados y estado por chat.
 * Los servicios de productos/precios se re-proveen aquí, igual que hacen otros módulos del proyecto.
 */
@Module({
  imports: [ConfigModule, BaseTecnicaModule, VentasModule, VentasReportsModule, ProformasReportsModule],
  controllers: [QuimiaController, TelegramController],
  providers: [
    QuimiaAgenteService,
    QuimiaHerramientasService,
    QuimiaProductosService,
    QuimiaClientesService,
    QuimiaConocimientoService,
    QuimiaDocumentosErpService,
    TelegramApiService,
    TranscripcionService,
    TelegramCuentaService,
    TelegramBotService,
    TelegramRunnerService,
    ProductosService,
    ConfigPreciosProductosService,
    AuditService,
    CoreService,
  ],
})
export class QuimiaModule {}
