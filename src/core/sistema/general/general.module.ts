import { Module } from '@nestjs/common';
import { GeneralService } from './general.service';
import { GeneralController } from './general.controller';
import { DataSourceService } from '../../connection/datasource.service';
import { ErrorsModule } from '../../../errors/errors.module';
import { CoreService } from '../../core.service';

@Module({
  imports: [ErrorsModule],
  controllers: [GeneralController],
  providers: [GeneralService, DataSourceService, CoreService],
})
export class GeneralModule { }
