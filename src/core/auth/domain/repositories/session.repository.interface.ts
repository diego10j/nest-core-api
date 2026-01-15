/**
 * Interface del repositorio de sesiones
 */
export interface ISessionRepository {
    /**
     * Cierra todas las sesiones activas de un usuario
     */
    closeActiveSessions(ideUsua: number, eventType: number): Promise<void>;
}

export const SESSION_REPOSITORY = Symbol('ISessionRepository');
