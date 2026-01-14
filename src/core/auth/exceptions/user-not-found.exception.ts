import { UnauthorizedException } from '@nestjs/common';

export class UserNotFoundException extends UnauthorizedException {
    constructor(message: string = 'Usuario no encontrado') {
        super(message);
    }
}
