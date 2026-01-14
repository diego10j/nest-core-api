import { BadRequestException } from '@nestjs/common';

export class InvalidPasswordException extends BadRequestException {
    constructor(message: string = 'Contraseña inválida') {
        super(message);
    }
}
