import { Inject, Injectable } from '@nestjs/common';
import { IUserRepository, USER_REPOSITORY } from '../../domain/repositories';
import { Password } from '../../domain/value-objects';
import { PasswordService } from '../../password.service';
import { PASSWORD_MESSAGES } from '../../constants/password.constants';
import { UserNotFoundException } from '../../exceptions/user-not-found.exception';
import { InvalidPasswordException } from '../../exceptions/invalid-password.exception';
import { UserId } from '../../domain/value-objects/user-id.vo';

/**
 * Use Case: Cambiar Contraseña de Usuario
 * SRP: Solo maneja el cambio de contraseña
 */
@Injectable()
export class ChangePasswordUseCase {
    constructor(
        @Inject(USER_REPOSITORY)
        private readonly userRepository: IUserRepository,
        private readonly passwordService: PasswordService,
    ) { }

    async execute(
        ideUsua: number,
        currentPassword: string,
        newPassword: string,
    ): Promise<{ message: string }> {
        console.log('🔍 ChangePasswordUseCase - ide_usua recibido:', ideUsua, typeof ideUsua);

        // Buscar usuario
        const user = await this.userRepository.findByNumericId(ideUsua);
        console.log('🔍 Usuario encontrado:', user ? 'SÍ' : 'NO');

        if (!user) {
            throw new UserNotFoundException(PASSWORD_MESSAGES.USER_NOT_FOUND);
        }

        // Obtener hash de contraseña actual usando ide_usua numérico
        const currentPasswordHash = await this.userRepository.getPasswordHashByNumericId(ideUsua);
        if (!currentPasswordHash) {
            throw new InvalidPasswordException(PASSWORD_MESSAGES.PASSWORD_VERIFICATION_FAILED);
        }

        // Validar contraseña actual
        await this.passwordService.validatePassword(currentPassword, currentPasswordHash);

        // Validar que las contraseñas sean diferentes
        this.passwordService.validatePasswordsDiffer(currentPassword, newPassword);

        // Crear value object y validar nueva contraseña
        const newPasswordVO = Password.create(newPassword);

        // Hash de nueva contraseña
        const hashedPassword = await this.passwordService.hashPassword(newPasswordVO.value);

        // Actualizar en BD
        await this.userRepository.updatePassword(ideUsua, hashedPassword);
        await this.userRepository.clearPasswordChangeFlag(ideUsua);

        return {
            message: PASSWORD_MESSAGES.UPDATE_SUCCESS,
        };
    }
}
