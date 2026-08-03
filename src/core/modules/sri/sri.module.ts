import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { CoreService } from '../../core.service';
import { AuditService } from '../audit/audit.service';

import { AtsController } from './ats/ats.controller';
import { AtsService } from './ats/ats.service';
import { ComprobantesElecController } from './cel/comprobantes-elec.controller';
import { ComprobantesElecService } from './cel/comprobantes-elec.service';
import { EmisorController } from './cel/emisor.controller';
import { EmisorService } from './cel/emisor.service';
import { FirmaController } from './cel/firma.controller';
import { FirmaService } from './cel/firma.service';
import { SriComprobanteCabeceraService } from './cel/sri-comprobante-cabecera.service';
import { ConfiguracionModule } from './configuracion/configuracion.module';
import { ComprobanteAutorizadoEmitter } from './envio/comprobante-autorizado.emitter';
import { ComprobanteEnvioController } from './envio/comprobante-envio.controller';
import { ComprobanteEnvioService } from './envio/comprobante-envio.service';
import { SriEnvioQueueService } from './envio/sri-envio-queue.service';
import { SriXmlComprobanteService } from './envio/sri-xml-comprobante.service';
import { FirmaXmlService } from './firma/firma-xml.service';
import { SriSoapClientService } from './soap/sri-soap-client.service';

@Module({
  imports: [ConfigModule, ConfiguracionModule],
  controllers: [ComprobantesElecController, FirmaController, EmisorController, ComprobanteEnvioController, AtsController],
  providers: [
    AuditService,
    CoreService,
    AtsService,
    ComprobantesElecService,
    FirmaService,
    EmisorService,
    SriComprobanteCabeceraService,
    FirmaXmlService,
    SriSoapClientService,
    SriXmlComprobanteService,
    ComprobanteEnvioService,
    SriEnvioQueueService,
    ComprobanteAutorizadoEmitter,
  ],
  exports: [
    ComprobantesElecService,
    FirmaService,
    EmisorService,
    SriComprobanteCabeceraService,
    ComprobanteEnvioService,
    SriEnvioQueueService,
    ComprobanteAutorizadoEmitter,
    SriXmlComprobanteService,
  ],
})
export class SriModule { }
