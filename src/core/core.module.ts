import { Module } from '@nestjs/common';
import { DataSourceService } from './connection/datasource.service';
import { UtilService } from './util/util.service';
import { AuditService } from './audit/audit.service';
import { AuditController } from './audit/audit.controller';
import { CoreController } from './core.controller';
import { CoreService } from './core.service';
import { ErrorsModule } from '../errors/errors.module';
@Module({
  imports: [ErrorsModule],
  providers: [DataSourceService, UtilService, AuditService, CoreService],
  exports: [DataSourceService],
  controllers: [AuditController, CoreController],
})
export class CoreModule { }
