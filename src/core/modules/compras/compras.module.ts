import { Module } from '@nestjs/common';
import { CoreService } from 'src/core/core.service';

import { ProveedorSaveService } from './proveedor/proveedor-save.service';
import { ProveedorController } from './proveedor/proveedor.controller';
import { ProveedorService } from './proveedor/proveedor.service';

@Module({
  controllers: [ProveedorController],
  providers: [ProveedorService, ProveedorSaveService, CoreService],
})
export class ComprasModule {}
