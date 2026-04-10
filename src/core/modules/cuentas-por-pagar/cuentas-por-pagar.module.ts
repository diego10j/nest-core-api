import { Module } from '@nestjs/common';
import { CoreService } from 'src/core/core.service';
import { CuentasPorPagarController } from './cuentas-por-pagar.controller';
import { CuentasPorPagarService } from './cuentas-por-pagar.service';
import { CuentasPorPagarSaveService } from './cuentas-por-pagar-save.service';
import { CuentasPorPagarOrdenService } from './cuentas-por-pagar-orden.service';
import { TesoreriaModule } from '../tesoreria/tesoreria.module';

@Module({
    imports: [TesoreriaModule],
    controllers: [CuentasPorPagarController],
    providers: [CuentasPorPagarService, CuentasPorPagarSaveService, CuentasPorPagarOrdenService, CoreService],
})
export class CuentasPorPagarModule { }
