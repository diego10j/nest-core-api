import { Module } from '@nestjs/common';
import { CoreService } from 'src/core/core.service';
import { ContabilidadModule } from 'src/core/modules/contabilidad/contabilidad.module';
import { DepositoCajaModule } from 'src/core/modules/tesoreria/deposito-caja/deposito-caja.module';
import { TesoreriaModule } from 'src/core/modules/tesoreria/tesoreria.module';

import { ChequeDevueltoSaveService } from './cheque-devuelto-save.service';
import { ChequeDevueltoController } from './cheque-devuelto.controller';
import { ChequeDevueltoService } from './cheque-devuelto.service';

/**
 * Módulo independiente (no anidado dentro de TesoreriaModule), mismo criterio que
 * DepositoCajaModule: depende de TesoreriaModule (PreLibroBancosSaveService), DepositoCajaModule
 * (DepositoCajaSaveService.anular, para el caso de un cheque ya depositado) y ContabilidadModule
 * (AsientosAutomaticosService). No puede vivir dentro de TesoreriaModule porque DepositoCajaModule
 * ya importa TesoreriaModule - lo contrario crearía una dependencia circular.
 */
@Module({
    imports: [TesoreriaModule, DepositoCajaModule, ContabilidadModule],
    controllers: [ChequeDevueltoController],
    providers: [
        ChequeDevueltoService,
        ChequeDevueltoSaveService,
        CoreService,
    ],
})
export class ChequeDevueltoModule { }
