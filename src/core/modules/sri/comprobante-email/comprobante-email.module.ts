import { Module } from '@nestjs/common';
import { CuentasPorPagarReportsModule } from 'src/reports/modules/cuentas-por-pagar/cuentas-por-pagar-reports.module';
import { VentasReportsModule } from 'src/reports/modules/ventas/ventas-reports.module';

import { SriModule } from '../sri.module';

import { ComprobanteEmailController } from './comprobante-email.controller';
import { ComprobanteEmailListener } from './comprobante-email.listener';

/**
 * Módulo orquestador: envía por correo (PDF+XML) los comprobantes que el SRI autoriza.
 * Importa SriModule (para ComprobanteAutorizadoEmitter/ComprobantesElecService) y los módulos
 * de reportes que exponen los generadores de PDF (ambos con `exports` explícito para esto —
 * VentasReportsModule y CuentasPorPagarReportsModule no exportaban sus servicios antes de este
 * cambio), sin que ninguno tenga que importarse a sí mismo de vuelta — solo este módulo,
 * importado una única vez desde AppModule, conoce a ambos lados.
 */
@Module({
    imports: [SriModule, VentasReportsModule, CuentasPorPagarReportsModule],
    controllers: [ComprobanteEmailController],
    providers: [ComprobanteEmailListener],
})
export class ComprobanteEmailModule { }
