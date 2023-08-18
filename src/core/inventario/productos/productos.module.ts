import { Module } from '@nestjs/common';
import { ProductosService } from './productos.service';
import { ProductosController } from './productos.controller';
import { UtilService } from '../../util/util.service';
import { DataSourceService } from '../../connection/datasource.service';
import { ErrorsModule } from '../../../errors/errors.module';

@Module({
  imports: [ErrorsModule],
  controllers: [ProductosController],
  providers: [DataSourceService, UtilService, ProductosService]
})
export class ProductosModule {}
