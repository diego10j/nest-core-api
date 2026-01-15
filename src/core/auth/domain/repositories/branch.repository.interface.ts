import { SucursalAuth } from '../../interfaces/auth-user.interface';

/**
 * Interface del repositorio de sucursales
 */
export interface IBranchRepository {
    /**
     * Obtiene las sucursales asignadas a un usuario
     */
    findByUserId(ideUsua: number): Promise<SucursalAuth[]>;
}

export const BRANCH_REPOSITORY = Symbol('IBranchRepository');
