import { Module } from '@nestjs/common';
import { CoreService } from 'src/core/core.service';

import { ProveedorController } from './proveedor/proveedor.controller';
import { ProveedorService } from './proveedor/proveedor.service';

@Module({
  controllers: [ProveedorController],
  providers: [ProveedorService, CoreService],
})
export class ComprasModule {}
