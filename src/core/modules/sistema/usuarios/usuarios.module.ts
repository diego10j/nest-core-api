import { Module } from '@nestjs/common';
import { UsuariosService } from './usuarios.service';
import { UsuariosController } from './usuarios.controller';
import { CoreService } from 'src/core/core.service';

@Module({
  imports: [],
  controllers: [UsuariosController],
  providers: [UsuariosService,  CoreService],
})
export class UsuariosModule { }
