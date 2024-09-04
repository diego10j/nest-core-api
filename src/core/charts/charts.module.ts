import { Module } from '@nestjs/common';

import { ErrorsModule } from '../../errors/errors.module';
import { DataSourceService } from '../connection/datasource.service';
import { ChartsController } from './charts.controller';
import { ChartsService } from './charts.service';

@Module({
    imports: [ErrorsModule],
    controllers: [ChartsController],
    providers: [DataSourceService, ChartsService]
})
export class ChartsModule { }
