import { Module } from '@nestjs/common';
import { CoreService } from 'src/core/core.service';
import { IntegrationModule } from 'src/core/integration/integration.module';

import { ContabilidadModule } from '../contabilidad/contabilidad.module';
import { SriModule } from '../sri/sri.module';
import { TesoreriaModule } from '../tesoreria/tesoreria.module';

import { CuentasPorPagarOrdenService } from './cuentas-por-pagar-orden.service';
import { CuentasPorPagarSaveService } from './cuentas-por-pagar-save.service';
import { CuentasPorPagarController } from './cuentas-por-pagar.controller';
import { CuentasPorPagarService } from './cuentas-por-pagar.service';
import { DocumentosCxPSaveService } from './documentos-cxp-save.service';
import { DocumentosCxPXmlService } from './documentos-cxp-xml.service';
import { DocumentosCxPController } from './documentos-cxp.controller';
import { DocumentosCxPService } from './documentos-cxp.service';
import { EnvioFacturaCxPService } from './envio-factura-cxp.service';
import { FleteConsolidadoSaveService } from './flete-consolidado-save.service';
import { FleteConsolidadoController } from './flete-consolidado.controller';
import { FleteConsolidadoService } from './flete-consolidado.service';
import { PagoOrdenEmailService } from './pago-orden-email.service';
import { RetencionesCxPSaveService } from './retenciones-cxp-save.service';
import { RetencionesCxPController } from './retenciones-cxp.controller';
import { RetencionesCxPService } from './retenciones-cxp.service';


@Module({
    imports: [TesoreriaModule, ContabilidadModule, SriModule, IntegrationModule],
    controllers: [
        CuentasPorPagarController,
        DocumentosCxPController,
        RetencionesCxPController,
        FleteConsolidadoController,
    ],
    providers: [
        CuentasPorPagarService,
        CuentasPorPagarSaveService,
        CuentasPorPagarOrdenService,
        DocumentosCxPService,
        DocumentosCxPSaveService,
        DocumentosCxPXmlService,
        EnvioFacturaCxPService,
        PagoOrdenEmailService,
        RetencionesCxPService,
        RetencionesCxPSaveService,
        FleteConsolidadoService,
        FleteConsolidadoSaveService,
        CoreService,
    ],
    exports: [
        DocumentosCxPService,
        DocumentosCxPSaveService,
    ],
})
export class CuentasPorPagarModule { }
