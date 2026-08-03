import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

@Module({
  imports: [ConfigModule],
  controllers: [AuditController],
  providers: [AuditService],
})
export class AuditModule {}
