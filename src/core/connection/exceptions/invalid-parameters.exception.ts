import { BadRequestException } from '@nestjs/common';

export class InvalidQueryParametersException extends BadRequestException {
    constructor(message: string = 'Parámetros de query inválidos') {
        super(message);
    }
}
