import { PerfilAuth } from '../../interfaces/auth-user.interface';

/**
 * Interface del repositorio de perfiles
 */
export interface IProfileRepository {
    /**
     * Obtiene los perfiles asignados a un usuario
     */
    findByUserId(ideUsua: number): Promise<PerfilAuth[]>;
}

export const PROFILE_REPOSITORY = Symbol('IProfileRepository');
