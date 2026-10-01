import { Inject, Injectable } from '@nestjs/common';

import { PASSWORD_MESSAGES } from '../../constants/password.constants';
import { IUserRepository, USER_REPOSITORY } from '../../domain/repositories';
import { UserNotFoundException } from '../../exceptions/user-not-found.exception';
import { PasswordService } from '../../password.service';
import { TemporaryPasswordService } from '../services/temporary-password.service';

/**
 * Use Case: Resetear Contraseña de Usuario
 * SRP: Solo maneja el reseteo de contraseña a valor por defecto
 * 
 * Genera una contraseña temporal aleatoria, la envía al correo registrado del usuario y activa el
 * flag cambia_clave_usua para forzar el cambio en el próximo login. Si el correo no se puede
 * enviar, no se modifica la contraseña actual.
 */
@Injectable()
export class ResetPasswordUseCase {


    constructor(
        @Inject(USER_REPOSITORY)
        private readonly userRepository: IUserRepository,
        private readonly passwordService: PasswordService,
        private readonly temporaryPassword: TemporaryPasswordService,
    ) { }

    async execute(ideUsua: number): Promise<{ message: string }> {
        // Buscar usuario
        const user = await this.userRepository.findByNumericId(ideUsua);

        if (!user) {
            throw new UserNotFoundException(PASSWORD_MESSAGES.USER_NOT_FOUND);
        }

        // Contraseña temporal aleatoria + correo ANTES de guardar: si el envío falla (o el usuario
        // no tiene correo) lanza error y la contraseña actual no cambia.
        const credentials = await this.temporaryPassword.prepare(ideUsua, 'reseteo');
        await credentials.send();

        // Actualizar contraseña y activar flag de cambio de clave
        const hashedPassword = await this.passwordService.hashPassword(credentials.password);
        await this.userRepository.updatePassword(ideUsua, hashedPassword);
        await this.userRepository.setPasswordChangeFlag(ideUsua);

        return {
            message: `Contraseña reseteada. Se envió una contraseña temporal a ${credentials.maskedEmail}; el usuario deberá cambiarla en su próximo inicio de sesión.`,
        };
    }
}
