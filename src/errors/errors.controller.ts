import { Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ErrorsLoggerService } from './errors-logger.service';

@ApiTags('Sistema-Errors')
@Controller('errors')
export class ErrorsController {
  constructor(private readonly errorsLoggerService: ErrorsLoggerService) { }

  @Get('getAllErrorLog')
  @ApiOperation({ summary: 'Obtener todos los errores registrados en el log en memoria' })
  getAllErrorLog() {
    const errorList = this.errorsLoggerService.getAllErrorLog();
    return { errorList };
  }

  @Post('clearAllErrorLog')
  @ApiOperation({ summary: 'Limpiar todos los errores del log en memoria' })
  clearAllErrorLog() {
    return this.errorsLoggerService.clearErrorLog();
  }
}
