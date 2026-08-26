import { Module } from '@nestjs/common';
import { CoreService } from 'src/core/core.service';
import { ContabilidadModule } from 'src/core/modules/contabilidad/contabilidad.module';
import { TesoreriaModule } from 'src/core/modules/tesoreria/tesoreria.module';

import { DepositoCajaSaveService } from './deposito-caja-save.service';
import { DepositoCajaController } from './deposito-caja.controller';
import { DepositoCajaService } from './deposito-caja.service';

/**
 * Módulo independiente (no anidado dentro de TesoreriaModule), mismo criterio que
 * DevolucionCobroTarjetaModule: solo depende de TesoreriaModule (PreLibroBancosSaveService,
 * ComprobanteBancoSaveService) y ContabilidadModule (AsientosAutomaticosService).
 */
@Module({
    imports: [TesoreriaModule, ContabilidadModule],
    controllers: [DepositoCajaController],
    providers: [
        DepositoCajaService,
        DepositoCajaSaveService,
        CoreService,
    ],
})
export class DepositoCajaModule { }
