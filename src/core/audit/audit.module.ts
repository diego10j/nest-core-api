import { Module } from '@nestjs/common';

import { ErrorsModule } from '../../errors/errors.module';
import { DataSourceService } from '../connection/datasource.service';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

@Module({
    imports: [ErrorsModule],
    controllers: [AuditController],
    providers: [DataSourceService, AuditService]
})
export class AuditModule { }
