import { Module } from '@nestjs/common';
import { SriModule } from 'src/core/modules/sri/sri.module';

import { CuentasPorPagarRepController } from './cuentas-por-pagar-rep.controller';
import { CuentasPorPagarRepService } from './cuentas-por-pagar-rep.service';

@Module({
    imports: [SriModule],
    controllers: [CuentasPorPagarRepController],
    providers: [CuentasPorPagarRepService],
    exports: [CuentasPorPagarRepService],
})
export class CuentasPorPagarReportsModule { }
