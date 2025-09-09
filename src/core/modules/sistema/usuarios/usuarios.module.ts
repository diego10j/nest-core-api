import { Module } from '@nestjs/common';
import { CoreService } from 'src/core/core.service';

import { UsuariosController } from './usuarios.controller';
import { UsuariosService } from './usuarios.service';

@Module({
  imports: [],
  controllers: [UsuariosController],
  providers: [UsuariosService, CoreService],
})
export class UsuariosModule {}
