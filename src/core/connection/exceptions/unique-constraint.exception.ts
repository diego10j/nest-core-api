import { ConflictException } from '@nestjs/common';

export class UniqueConstraintViolationException extends ConflictException {
  constructor(message: string = 'Violación de restricción única') {
    super(message);
  }
}
