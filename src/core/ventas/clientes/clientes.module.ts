import { Module } from '@nestjs/common';
import { ClientesService } from './clientes.service';
import { ClientesController } from './clientes.controller';
import { UtilService } from '../../util/util.service';
import { DataSourceService } from '../../connection/datasource.service';
import { ErrorsModule } from '../../../errors/errors.module';

@Module({
  imports: [ErrorsModule],
  controllers: [ClientesController],
  providers: [DataSourceService, UtilService, ClientesService]
})
export class ClientesModule { }
