import { Module } from '@nestjs/common';
import { CoreService } from 'src/core/core.service';

import { ContabilidadModule } from '../contabilidad/contabilidad.module';
import { TesoreriaModule } from '../tesoreria/tesoreria.module';

import { CuentasPorPagarOrdenService } from './cuentas-por-pagar-orden.service';
import { CuentasPorPagarSaveService } from './cuentas-por-pagar-save.service';
import { CuentasPorPagarController } from './cuentas-por-pagar.controller';
import { CuentasPorPagarService } from './cuentas-por-pagar.service';
import { DocumentosCxPSaveService } from './documentos-cxp-save.service';
import { DocumentosCxPXmlService } from './documentos-cxp-xml.service';
import { DocumentosCxPController } from './documentos-cxp.controller';
import { DocumentosCxPService } from './documentos-cxp.service';
import { RetencionesCxPSaveService } from './retenciones-cxp-save.service';
import { RetencionesCxPController } from './retenciones-cxp.controller';
import { RetencionesCxPService } from './retenciones-cxp.service';


@Module({
    imports: [TesoreriaModule, ContabilidadModule],
    controllers: [
        CuentasPorPagarController,
        DocumentosCxPController,
        RetencionesCxPController,
    ],
    providers: [
        CuentasPorPagarService,
        CuentasPorPagarSaveService,
        CuentasPorPagarOrdenService,
        DocumentosCxPService,
        DocumentosCxPSaveService,
        DocumentosCxPXmlService,
        RetencionesCxPService,
        RetencionesCxPSaveService,
        CoreService,
    ],
})
export class CuentasPorPagarModule { }
