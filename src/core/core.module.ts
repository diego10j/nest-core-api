import { Module } from '@nestjs/common';

import { DataSourceService } from './connection/datasource.service';
import { UtilService } from './util/util.service';
import { AuditService } from './audit/audit.service';
import { AuditController } from './audit/audit.controller';

@Module({

  providers: [DataSourceService, UtilService, AuditService],
  exports: [DataSourceService],
  controllers: [AuditController],
})
export class CoreModule { }
