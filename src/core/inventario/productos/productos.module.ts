import { Module } from '@nestjs/common';
import { ProductosService } from './productos.service';
import { ProductosController } from './productos.controller';
import { DataSourceService } from '../../connection/datasource.service';
import { ErrorsModule } from '../../../errors/errors.module';
import { AuditService } from 'src/core/audit/audit.service';

@Module({
  imports: [ErrorsModule],
  controllers: [ProductosController],
  providers: [DataSourceService, ProductosService, AuditService]
})
export class ProductosModule { }
