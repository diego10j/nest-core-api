import { Module } from '@nestjs/common';

import { BaseConocimientoController } from './base-conocimiento.controller';
import { BaseConocimientoService } from './base-conocimiento.service';

@Module({
  controllers: [BaseConocimientoController],
  providers: [BaseConocimientoService],
  exports: [BaseConocimientoService],
})
export class BaseConocimientoModule {}
