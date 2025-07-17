import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { CoreService } from '../../../core.service';

@Module({
  imports: [],
  controllers: [AdminController],
  providers: [AdminService,  CoreService],
})
export class AdminModule { }
