import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CoreService } from 'src/core/core.service';

import { UsuariosController } from './usuarios.controller';
import { UsuariosService } from './usuarios.service';

@Module({
  imports: [ConfigModule],
  controllers: [UsuariosController],
  providers: [UsuariosService, CoreService],
})
export class UsuariosModule {}
