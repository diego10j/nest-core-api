import { Module } from '@nestjs/common';
import { ErrorsService } from './errors.service';
import { ErrorsController } from './errors.controller';
import { ErrorsLoggerService } from './errors-logger.service';

@Module({
  controllers: [ErrorsController],
  providers: [ErrorsService, ErrorsLoggerService],
  exports: [ErrorsService, ErrorsLoggerService],
})
export class ErrorsModule { }


