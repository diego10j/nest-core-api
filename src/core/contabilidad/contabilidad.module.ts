import { Module } from '@nestjs/common';

import { ErrorsModule } from '../../errors/errors.module';
import { DataSourceService } from '../connection/datasource.service';
import { AuditService } from '../audit/audit.service';
import { CoreService } from '../core.service';
import { FormasPagoService } from './formas-pago/formas-pago.service';
import { FormasPagoController } from './formas-pago/formas-pago.controller';


@Module({
    imports: [ErrorsModule],
     controllers: [FormasPagoController],
    providers: [DataSourceService, AuditService, CoreService, FormasPagoService]
})
export class ContabilidadModule { }
