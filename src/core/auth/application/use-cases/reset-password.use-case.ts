import { Inject, Injectable } from '@nestjs/common';
import { IUserRepository, USER_REPOSITORY } from '../../domain/repositories';
import { PasswordService } from '../../password.service';
import { PASSWORD_CONFIG, PASSWORD_MESSAGES } from '../../constants/password.constants';
import { UserNotFoundException } from '../../exceptions/user-not-found.exception';

/**
 * Use Case: Resetear Contraseña de Usuario
 * SRP: Solo maneja el reseteo de contraseña a valor por defecto
 * 
 * Este use case resetea la contraseña default
 * y activa el flag cambia_clave_usua para forzar el cambio en el próximo login
 */
@Injectable()
export class ResetPasswordUseCase {


    constructor(
        @Inject(USER_REPOSITORY)
        private readonly userRepository: IUserRepository,
        private readonly passwordService: PasswordService,
    ) { }

    async execute(ideUsua: number): Promise<{ message: string }> {
        // Buscar usuario
        const user = await this.userRepository.findByNumericId(ideUsua);

        if (!user) {
            throw new UserNotFoundException(PASSWORD_MESSAGES.USER_NOT_FOUND);
        }

        // Hash de contraseña por defecto
        const hashedPassword = await this.passwordService.hashPassword(PASSWORD_CONFIG.DEFAULT_PASSWORD);

        // Actualizar contraseña y activar flag de cambio de clave
        await this.userRepository.updatePassword(ideUsua, hashedPassword);
        await this.userRepository.setPasswordChangeFlag(ideUsua);

        return {
            message: 'Contraseña reseteada exitosamente. El usuario deberá cambiarla en su próximo inicio de sesión.',
        };
    }
}
