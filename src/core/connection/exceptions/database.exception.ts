import { InternalServerErrorException } from '@nestjs/common';

export class DatabaseException extends InternalServerErrorException {
  constructor(message: string = 'Error en la base de datos') {
    super(message);
  }
}
