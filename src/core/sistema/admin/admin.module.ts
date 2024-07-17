import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { CoreService } from '../../core.service';
import { ErrorsModule } from '../../../errors/errors.module';

@Module({
  imports: [ErrorsModule],
  controllers: [AdminController],
  providers: [AdminService, DataSourceService, CoreService],
})
export class AdminModule { }
