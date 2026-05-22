import { Module } from '@nestjs/common';

import { ProveedorController } from './proveedor/proveedor.controller';
import { ProveedorService } from './proveedor/proveedor.service';

@Module({
  controllers: [ProveedorController],
  providers: [ProveedorService],
})
export class ComprasModule {}
