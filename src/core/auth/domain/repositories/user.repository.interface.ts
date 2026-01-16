import { User } from '../entities/user.entity';
import { Email } from '../value-objects/email.vo';
import { UserId } from '../value-objects/user-id.vo';

/**
 * Interface del repositorio de usuarios (Domain Layer)
 * Define el contrato sin depender de la implementación
 * Principio de Inversión de Dependencias (DIP)
 */
export interface IUserRepository {
    /**
     * Busca un usuario por email
     */
    findByEmail(email: Email): Promise<User | null>;

    /**
     * Busca un usuario por email o login (nick_usua)
     */
    findByEmailOrLogin(identifier: string): Promise<User | null>;

    /**
     * Busca un usuario por UUID
     */
    findById(id: UserId): Promise<User | null>;

    /**
     * Busca un usuario por ID numérico
     */
    findByNumericId(ideUsua: number): Promise<User | null>;

    /**
     * Obtiene el hash de contraseña de un usuario por UUID
     */
    getPasswordHash(id: UserId): Promise<string | null>;

    /**
     * Obtiene el hash de contraseña de un usuario por ID numérico
     */
    getPasswordHashByNumericId(ideUsua: number): Promise<string | null>;

    /**
     * Actualiza la contraseña de un usuario
     */
    updatePassword(ideUsua: number, hashedPassword: string): Promise<void>;

    /**
     * Limpia el flag de cambio de contraseña
     */
    clearPasswordChangeFlag(ideUsua: number): Promise<void>;

    /**
     * Activa el flag de cambio de contraseña
     */
    setPasswordChangeFlag(ideUsua: number): Promise<void>;
}

export const USER_REPOSITORY = Symbol('IUserRepository');
