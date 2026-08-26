import { Module } from '@nestjs/common';
import { CoreService } from 'src/core/core.service';
import { IntegrationModule } from 'src/core/integration/integration.module';
import { ContabilidadModule } from 'src/core/modules/contabilidad/contabilidad.module';
import { FilesModule } from 'src/core/modules/sistema/files/files.module';

import { BancosSaveService } from './bancos/bancos-save.service';
import { BancosController } from './bancos/bancos.controller';
import { BancosService } from './bancos/bancos.service';
import { CajasSaveService } from './cajas/cajas-save.service';
import { CajasController } from './cajas/cajas.controller';
import { CajasService } from './cajas/cajas.service';
import { ChequesController } from './cheques/cheques.controller';
import { ChequesService } from './cheques/cheques.service';
import { ComprobanteBancoSaveService } from './comprobante-banco/comprobante-banco-save.service';
import { ComprobanteBancoController } from './comprobante-banco/comprobante-banco.controller';
import { ComprobanteBancoService } from './comprobante-banco/comprobante-banco.service';
import { CxcTransaccionesSaveService } from './cxc-transacciones/cxc-transacciones-save.service';
import { CxcTransaccionesController } from './cxc-transacciones/cxc-transacciones.controller';
import { CxcTransaccionesService } from './cxc-transacciones/cxc-transacciones.service';
import { CxpTransaccionesSaveService } from './cxp-transacciones/cxp-transacciones-save.service';
import { CxpTransaccionesController } from './cxp-transacciones/cxp-transacciones.controller';
import { CxpTransaccionesService } from './cxp-transacciones/cxp-transacciones.service';
import { PagoCxPEmailService } from './cxp-transacciones/pago-cxp-email.service';
import { TesoreriaBiController } from './data-bi/tesoreria-bi.controller';
import { TesoreriaBiService } from './data-bi/tesoreria-bi.service';
import { PreLibroBancosConciliacionService } from './pre-libro-bancos/pre-libro-bancos-conciliacion.service';
import { PreLibroBancosDiferenciasService } from './pre-libro-bancos/pre-libro-bancos-diferencias.service';
import { PreLibroBancosSaveService } from './pre-libro-bancos/pre-libro-bancos-save.service';
import { PreLibroBancosController } from './pre-libro-bancos/pre-libro-bancos.controller';
import { PreLibroBancosService } from './pre-libro-bancos/pre-libro-bancos.service';
import { ReportesTesoreriaController } from './reportes/reportes-tesoreria.controller';
import { ReportesTesoreriaService } from './reportes/reportes-tesoreria.service';
import { TesoreriaLdService } from './tesoreria-ld.service';
import { TransaccionesTesoreriaService } from './tesoreria-transacciones.service';
import { TesoreriaController } from './tesoreria.controller';
import { TesoreriaService } from './tesoreria.service';

@Module({
    imports: [IntegrationModule, ContabilidadModule, FilesModule],
    controllers: [
        TesoreriaController,
        PreLibroBancosController,
        ChequesController,
        ReportesTesoreriaController,
        BancosController,
        CajasController,
        ComprobanteBancoController,
        CxcTransaccionesController,
        CxpTransaccionesController,
        TesoreriaBiController,
    ],
    providers: [
        TesoreriaService,
        TesoreriaLdService,
        TransaccionesTesoreriaService,
        PreLibroBancosService,
        PreLibroBancosSaveService,
        PreLibroBancosConciliacionService,
        PreLibroBancosDiferenciasService,
        ChequesService,
        ReportesTesoreriaService,
        BancosService,
        BancosSaveService,
        CajasService,
        CajasSaveService,
        ComprobanteBancoService,
        ComprobanteBancoSaveService,
        CxcTransaccionesService,
        CxcTransaccionesSaveService,
        CxpTransaccionesService,
        CxpTransaccionesSaveService,
        PagoCxPEmailService,
        TesoreriaBiService,
        CoreService,
    ],
    exports: [
        TransaccionesTesoreriaService,
        PreLibroBancosSaveService,
        CxpTransaccionesSaveService,
        ComprobanteBancoSaveService,
    ],
})
export class TesoreriaModule { }
