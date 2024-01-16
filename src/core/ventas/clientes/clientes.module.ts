import { Module } from '@nestjs/common';
import { ClientesService } from './clientes.service';
import { ClientesController } from './clientes.controller';
import { DataSourceService } from '../../connection/datasource.service';
import { ErrorsModule } from '../../../errors/errors.module';

@Module({
  imports: [ErrorsModule],
  controllers: [ClientesController],
  providers: [DataSourceService, ClientesService]
})
export class ClientesModule { }
