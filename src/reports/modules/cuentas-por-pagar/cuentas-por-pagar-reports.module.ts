import { Module } from '@nestjs/common';
import { CuentasPorPagarModule } from 'src/core/modules/cuentas-por-pagar/cuentas-por-pagar.module';

import { CuentasPorPagarRepController } from './cuentas-por-pagar-rep.controller';
import { CuentasPorPagarRepService } from './cuentas-por-pagar-rep.service';

@Module({
    imports: [CuentasPorPagarModule],
    controllers: [CuentasPorPagarRepController],
    providers: [CuentasPorPagarRepService],
    exports: [CuentasPorPagarRepService],
})
export class CuentasPorPagarReportsModule { }
