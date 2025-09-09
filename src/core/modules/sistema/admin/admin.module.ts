import { Module } from '@nestjs/common';

import { CoreService } from '../../../core.service';

import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [],
  controllers: [AdminController],
  providers: [AdminService, CoreService],
})
export class AdminModule {}
