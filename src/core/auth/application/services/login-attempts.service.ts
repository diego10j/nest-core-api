import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Login Attempts Service - Gestión de intentos fallidos de login
 * 
 * Responsabilidad: Prevenir ataques de fuerza bruta mediante bloqueo temporal
 * 
 * Configuración:
 * - MAX_ATTEMPTS: 5 intentos
 * - LOCK_DURATION: 15 minutos
 * - ATTEMPT_WINDOW: 1 hora
 */
@Injectable()
export class LoginAttemptsService {
    private readonly redis: Redis;
    private readonly MAX_ATTEMPTS = 5;
    private readonly LOCK_DURATION = 15 * 60; // 15 minutos en segundos
    private readonly ATTEMPT_WINDOW = 60 * 60; // 1 hora en segundos

    constructor(@Inject('REDIS_CLIENT') redisClient: Redis) {
        // Crear conexión separada con DB diferente para intentos
        this.redis = redisClient.duplicate();
        this.redis.select(2); // Base de datos 2 para intentos de login
    }

    /**
     * Registra un intento fallido de login
     * @param identifier - Email o IP del usuario
     * @returns Número de intentos fallidos
     */
    async recordFailedAttempt(identifier: string): Promise<number> {
        const key = `login:failed:${identifier}`;
        const attempts = await this.redis.incr(key);

        // Establecer TTL solo en el primer intento
        if (attempts === 1) {
            await this.redis.expire(key, this.ATTEMPT_WINDOW);
        }

        // Si alcanza el máximo, bloquear
        if (attempts >= this.MAX_ATTEMPTS) {
            await this.lockAccount(identifier);
        }

        return attempts;
    }

    /**
     * Verifica si una cuenta está bloqueada
     * @param identifier - Email o IP del usuario
     * @throws UnauthorizedException si está bloqueada
     */
    async checkIfLocked(identifier: string): Promise<void> {
        const lockKey = `login:locked:${identifier}`;
        const isLocked = await this.redis.exists(lockKey);

        if (isLocked) {
            const ttl = await this.redis.ttl(lockKey);
            const minutes = Math.ceil(ttl / 60);
            throw new UnauthorizedException(
                `Cuenta temporalmente bloqueada por múltiples intentos fallidos. Intente nuevamente en ${minutes} minuto(s).`
            );
        }
    }

    /**
     * Bloquea una cuenta temporalmente
     * @param identifier - Email o IP del usuario
     */
    private async lockAccount(identifier: string): Promise<void> {
        const lockKey = `login:locked:${identifier}`;
        await this.redis.set(lockKey, '1', 'EX', this.LOCK_DURATION);
    }

    /**
     * Resetea los intentos fallidos después de un login exitoso
     * @param identifier - Email o IP del usuario
     */
    async resetFailedAttempts(identifier: string): Promise<void> {
        const failedKey = `login:failed:${identifier}`;
        const lockKey = `login:locked:${identifier}`;

        await this.redis.del(failedKey);
        await this.redis.del(lockKey);
    }

    /**
     * Obtiene el número actual de intentos fallidos
     * @param identifier - Email o IP del usuario
     * @returns Número de intentos fallidos
     */
    async getFailedAttempts(identifier: string): Promise<number> {
        const key = `login:failed:${identifier}`;
        const attempts = await this.redis.get(key);
        return attempts ? parseInt(attempts) : 0;
    }

    /**
     * Obtiene el tiempo restante de bloqueo en segundos
     * @param identifier - Email o IP del usuario
     * @returns Segundos restantes o 0 si no está bloqueado
     */
    async getRemainingLockTime(identifier: string): Promise<number> {
        const lockKey = `login:locked:${identifier}`;
        const ttl = await this.redis.ttl(lockKey);
        return ttl > 0 ? ttl : 0;
    }

    async onModuleDestroy() {
        await this.redis.quit();
    }
}
