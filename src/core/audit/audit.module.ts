import { Module } from '@nestjs/common';
import { ErrorsModule } from 'src/errors/errors.module';
import { DataSourceService } from '../connection/datasource.service';
import { HttpModule } from '@nestjs/axios';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { ActivityService } from './activity.service';

@Module({
    imports: [ErrorsModule, HttpModule],
    controllers: [AuditController],
    providers: [AuditService, ActivityService]
})
export class AuditModule { }
