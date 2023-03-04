import { Module } from '@nestjs/common';

import { DataSourceService } from './connection/datasource.service';
import { UtilService } from './util/util.service';
import { AuditService } from './audit/audit.service';

@Module({

  providers: [DataSourceService, UtilService, AuditService],
  exports: [DataSourceService],
})
export class CoreModule { }
