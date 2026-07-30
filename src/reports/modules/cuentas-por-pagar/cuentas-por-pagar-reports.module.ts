import { Module } from '@nestjs/common';

import { CuentasPorPagarRepController } from './cuentas-por-pagar-rep.controller';
import { CuentasPorPagarRepService } from './cuentas-por-pagar-rep.service';

@Module({
    controllers: [CuentasPorPagarRepController],
    providers: [CuentasPorPagarRepService],
    exports: [CuentasPorPagarRepService],
})
export class CuentasPorPagarReportsModule { }
