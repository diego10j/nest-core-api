/**
 * Interfaz para abstraer la implementación de caché
 * Permite cambiar la implementación sin afectar el resto del código
 */
export interface ICacheProvider {
    /**
     * Obtiene un valor del caché
     */
    get<T>(key: string): Promise<T | null>;

    /**
     * Establece un valor en el caché
     * @param ttl Tiempo de vida en segundos (opcional)
     */
    set<T>(key: string, value: T, ttl?: number): Promise<void>;

    /**
     * Elimina una clave específica
     */
    del(key: string): Promise<void>;

    /**
     * Elimina múltiples claves que coincidan con un patrón
     */
    delPattern(pattern: string): Promise<void>;

    /**
     * Elimina todas las claves
     */
    clear(): Promise<void>;
}
