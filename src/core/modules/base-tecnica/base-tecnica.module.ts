import { Module } from '@nestjs/common';

import { BaseTecnicaController } from './base-tecnica.controller';
import { BdtChatService } from './bdt-chat.service';
import { BdtDatosService } from './bdt-datos.service';
import { BdtExtraccionService } from './bdt-extraccion.service';
import { BdtIaService } from './bdt-ia.service';
import { BdtProcesoService } from './bdt-proceso.service';

/**
 * Base técnica DIQUIMEC (tablas bdt_*, ver scripts/base_tecnica.sql): fichas técnicas, COA y hojas
 * de seguridad de los productos, extraídas con IA, más el chat QuimIA que responde sobre ellas.
 *
 * Módulo independiente (no es parte de Inventario): su única relación con el ERP es ide_inarti.
 * Los adjuntos se leen en solo lectura desde sis_archivo al procesar; el chat solo lee tablas bdt_*.
 */
@Module({
  controllers: [BaseTecnicaController],
  providers: [BdtIaService, BdtExtraccionService, BdtProcesoService, BdtDatosService, BdtChatService],
})
export class BaseTecnicaModule {}
