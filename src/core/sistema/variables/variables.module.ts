import { Module } from '@nestjs/common';
import { DataSourceService } from '../../connection/datasource.service';
import { ErrorsModule } from '../../../errors/errors.module';
import { CoreService } from '../../core.service';

import { VariablesService } from './variables.service';
import { VariablesController } from './variables.controller';

@Module({
  imports: [ErrorsModule],
  controllers: [VariablesController],
  providers: [ VariablesService, DataSourceService, CoreService],
})
export class VariablesModule { }
