import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CoreService } from 'src/core/core.service';

import { TemporaryPasswordService } from 'src/core/auth/application/services/temporary-password.service';

import { UsuariosController } from './usuarios.controller';
import { UsuariosService } from './usuarios.service';

@Module({
  imports: [ConfigModule],
  controllers: [UsuariosController],
  providers: [UsuariosService, CoreService, TemporaryPasswordService],
})
export class UsuariosModule {}
