import { Controller, Get, Post } from '@nestjs/common';

import { ErrorsLoggerService } from './errors-logger.service';

@Controller('errors')
export class ErrorsController {
  constructor(private readonly errorsLoggerService: ErrorsLoggerService) {}

  @Get('getAllErrorLog')
  getAllErrorLog() {
    const errorList = this.errorsLoggerService.getAllErrorLog();
    return { errorList };
  }

  @Post('clearAllErrorLog')
  clearAllErrorLog() {
    return this.errorsLoggerService.clearErrorLog();
  }
}
