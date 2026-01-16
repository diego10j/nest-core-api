import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { IUserRepository, USER_REPOSITORY } from '../../domain/repositories';
import { Email, Password } from '../../domain/value-objects';
import { PasswordService } from '../../password.service';
import { AuthUser } from '../../interfaces/auth-user.interface';

/**
 * Use Case: Validar Credenciales de Usuario
 * Principio de Responsabilidad Única (SRP)
 * Caso de uso específico para validación de credenciales
 */
@Injectable()
export class ValidateUserCredentialsUseCase {
    constructor(
        @Inject(USER_REPOSITORY)
        private readonly userRepository: IUserRepository,
        private readonly passwordService: PasswordService,
    ) { }

    /**
     * Ejecuta la validación de credenciales
     * @param identifier Email o login del usuario
     * @param rawPassword Contraseña en texto plano
     * @returns Usuario si las credenciales son válidas
     * @throws UnauthorizedException si las credenciales son inválidas
     */
    async execute(identifier: string, rawPassword: string): Promise<{ ideUsua: number; uuid: string; requireChange: boolean; isSuperUser: boolean }> {
        // Crear value object de password
        const passwordVO = Password.create(rawPassword);

        // Buscar usuario por email o login
        const user = await this.userRepository.findByEmailOrLogin(identifier);
        if (!user) {
            throw new UnauthorizedException('Credenciales no válidas, usuario incorrecto');
        }

        // Verificar si el usuario puede hacer login
        if (!user.canLogin()) {
            throw new UnauthorizedException('Usuario bloqueado, contactese con el administrador del sistema.');
        }

        // Obtener hash de contraseña
        const passwordHash = await this.userRepository.getPasswordHash(user.id);
        if (!passwordHash) {
            throw new UnauthorizedException('Credenciales no válidas, contraseña incorrecta');
        }

        // Validar contraseña
        try {
            await this.passwordService.validatePassword(passwordVO.value, passwordHash);
        } catch (error) {
            throw new UnauthorizedException('Credenciales no válidas, contraseña incorrecta');
        }

        return {
            ideUsua: user.ideUsua,
            uuid: user.id.value,
            requireChange: user.requirePasswordChange,
            isSuperUser: user.isSuperUser,
        };
    }
}
