import { Module } from '@nestjs/common';
import { CoreService } from 'src/core/core.service';

import { TesoreriaModule } from '../tesoreria/tesoreria.module';

import { CuentasPorPagarOrdenService } from './cuentas-por-pagar-orden.service';
import { CuentasPorPagarSaveService } from './cuentas-por-pagar-save.service';
import { CuentasPorPagarController } from './cuentas-por-pagar.controller';
import { CuentasPorPagarService } from './cuentas-por-pagar.service';
import { DocumentosCxPSaveService } from './documentos-cxp-save.service';
import { DocumentosCxPController } from './documentos-cxp.controller';
import { DocumentosCxPService } from './documentos-cxp.service';


@Module({
    imports: [TesoreriaModule],
    controllers: [
        CuentasPorPagarController,
        DocumentosCxPController,
    ],
    providers: [
        CuentasPorPagarService,
        CuentasPorPagarSaveService,
        CuentasPorPagarOrdenService,
        DocumentosCxPService,
        DocumentosCxPSaveService,
        CoreService,
    ],
})
export class CuentasPorPagarModule { }
