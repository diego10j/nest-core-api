import { ConflictException } from '@nestjs/common';

export class ForeignKeyViolationException extends ConflictException {
    constructor(message: string = 'Violación de clave foránea') {
        super(message);
    }
}
