import { Module } from '@nestjs/common';
import { CoreService } from 'src/core/core.service';

import { CuentasPorCobrarController } from './cuentas-por-cobrar.controller';
import { CuentasPorCobrarService } from './cuentas-por-cobrar.service';

@Module({
  imports: [],
  controllers: [CuentasPorCobrarController],
  providers: [CuentasPorCobrarService, CoreService],
})
export class CuentasPorCobrarModule {}
