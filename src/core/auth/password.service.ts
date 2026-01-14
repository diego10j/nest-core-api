import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PASSWORD_CONFIG, PASSWORD_MESSAGES } from './constants/password.constants';
import { InvalidPasswordException } from './exceptions/invalid-password.exception';

@Injectable()
export class PasswordService {
    /**
     * Encripta una contraseña en texto plano
     */
    async hashPassword(plainPassword: string): Promise<string> {
        return bcrypt.hash(plainPassword, PASSWORD_CONFIG.SALT_ROUNDS);
    }

    /**
     * Compara una contraseña en texto plano con su versión encriptada
     */
    async validatePassword(plainPassword: string, hashedPassword: string): Promise<void> {
        const isValid = await bcrypt.compare(plainPassword, hashedPassword);
        if (!isValid) {
            throw new InvalidPasswordException(PASSWORD_MESSAGES.INVALID_CURRENT_PASSWORD);
        }
    }

    /**
     * Valida que dos contraseñas sean diferentes
     */
    validatePasswordsDiffer(currentPassword: string, newPassword: string): void {
        if (currentPassword === newPassword) {
            throw new InvalidPasswordException(PASSWORD_MESSAGES.SAME_PASSWORD);
        }
    }
}
