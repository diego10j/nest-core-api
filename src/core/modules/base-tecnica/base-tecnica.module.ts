import { Module } from '@nestjs/common';

import { BaseTecnicaController } from './base-tecnica.controller';
import { BdtConsultaService } from './bdt-consulta.service';
import { BdtContenidoService } from './bdt-contenido.service';
import { BdtDatosService } from './bdt-datos.service';
import { BdtExtraccionService } from './bdt-extraccion.service';
import { BdtIaService } from './bdt-ia.service';
import { BdtProcesoService } from './bdt-proceso.service';

/**
 * Base técnica DIQUIMEC (tablas bdt_*, ver scripts/base_tecnica.sql): fichas técnicas, COA y hojas
 * de seguridad de los productos, extraídas con IA. El chat QuimIA vive en el módulo quimia.
 *
 * Módulo independiente (no es parte de Inventario): su única relación con el ERP es ide_inarti.
 * Los adjuntos se leen en solo lectura desde sis_archivo al procesar.
 */
@Module({
  controllers: [BaseTecnicaController],
  providers: [
    BdtIaService,
    BdtExtraccionService,
    BdtProcesoService,
    BdtDatosService,
    BdtConsultaService,
    BdtContenidoService,
  ],
  // El asistente QuimIA (módulo quimia) usa la IA y las consultas de la base técnica.
  exports: [BdtIaService, BdtConsultaService],
})
export class BaseTecnicaModule {}
