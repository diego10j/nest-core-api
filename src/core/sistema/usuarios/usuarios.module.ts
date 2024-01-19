import { Module } from '@nestjs/common';
import { UsuariosService } from './usuarios.service';
import { UsuariosController } from './usuarios.controller';
import { ErrorsModule } from '../../../errors/errors.module';
import { DataSourceService } from '../../connection/datasource.service';

@Module({
  imports: [ErrorsModule],
  controllers: [UsuariosController],
  providers: [UsuariosService, DataSourceService],
})
export class UsuariosModule { }
