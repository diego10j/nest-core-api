import { Module } from '@nestjs/common';

import { FilesModule } from '../sistema/files/files.module';

import { AlertasIaService } from './alertas-ia.service';
import { BaseTecnicaController } from './base-tecnica.controller';
import { BdtAutomaticoService } from './bdt-automatico.service';
import { BdtConsultaService } from './bdt-consulta.service';
import { BdtContenidoService } from './bdt-contenido.service';
import { BdtDatosService } from './bdt-datos.service';
import { BdtExtraccionService } from './bdt-extraccion.service';
import { BdtIaService } from './bdt-ia.service';
import { BdtMarcaAguaService } from './bdt-marca-agua.service';
import { BdtMasivoService } from './bdt-masivo.service';
import { BdtProcesoService } from './bdt-proceso.service';

/**
 * Base técnica DIQUIMEC (tablas bdt_*, ver scripts/base_tecnica.sql): fichas técnicas, COA y hojas
 * de seguridad de los productos, extraídas con IA. El chat QuimIA vive en el módulo quimia.
 *
 * Módulo independiente (no es parte de Inventario): su única relación con el ERP es ide_inarti.
 * Los adjuntos se leen en solo lectura desde sis_archivo al procesar.
 */
@Module({
  // FilesModule: aviso de archivos subidos/movidos (extracción automática).
  imports: [FilesModule],
  controllers: [BaseTecnicaController],
  providers: [
    BdtIaService,
    BdtExtraccionService,
    BdtProcesoService,
    BdtDatosService,
    BdtConsultaService,
    BdtContenidoService,
    BdtMasivoService,
    BdtAutomaticoService,
    BdtMarcaAguaService,
    AlertasIaService,
  ],
  // El asistente QuimIA (módulo quimia) usa la IA y las consultas de la base técnica.
  exports: [BdtIaService, BdtConsultaService, AlertasIaService],
})
export class BaseTecnicaModule {}
