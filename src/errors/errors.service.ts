import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';

import { ErrorsLoggerService } from './errors-logger.service';

@Injectable()
export class ErrorsService {
  constructor(private readonly errorsLoggerService: ErrorsLoggerService) {}
  createError(error: any) {
    /** Registramos el error en nuestro log */
    this.errorsLoggerService.createErrorLog('Error capturado en el catch', error);

    /** Mensaje personalizado cuando existe un registro duplicado */
    if (error.name === 'MongoServerError' && error.code === 11000) {
      throw new BadRequestException(`El ${Object.keys(error.keyValue)} ya existe`);
    } else {
      /** Mensaje de error por defecto */
      throw new InternalServerErrorException(error.message);
    }
  }
}
