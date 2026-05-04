import { Injectable, Inject } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Token Blacklist Service - Invalidación de tokens JWT
 * 
 * Responsabilidad: Gestionar tokens invalidados (logout, cambio de contraseña)
 * Usa Redis para almacenar tokens con TTL automático
 */
@Injectable()
export class TokenBlacklistService {
    private readonly redis: Redis;

    constructor(@Inject('REDIS_CLIENT') redisClient: Redis) {
        // Crear conexión separada con DB diferente para blacklist
        this.redis = redisClient.duplicate();
        this.redis.select(1); // Base de datos 1 para blacklist
    }

    /**
     * Agrega un token a la blacklist
     * @param token - Token JWT a invalidar
     * @param expiresIn - Tiempo en segundos hasta que expire naturalmente
     */
    async blacklistToken(token: string, expiresIn: number): Promise<void> {
        const key = `blacklist:${token}`;
        // Guardamos con TTL igual a la expiración del token
        await this.redis.set(key, '1', 'EX', expiresIn);
    }

    /**
     * Verifica si un token está en la blacklist
     * @param token - Token JWT a verificar
     * @returns true si está invalidado, false si es válido
     */
    async isTokenBlacklisted(token: string): Promise<boolean> {
        const key = `blacklist:${token}`;
        const result = await this.redis.get(key);
        return result !== null;
    }

    /**
     * Invalida todos los tokens activos de un usuario.
     * Agrega cada token a la blacklist antes de eliminar el registro de seguimiento.
     * Útil cuando se cambia la contraseña o se bloquea el usuario.
     */
    async blacklistAllUserTokens(userId: string): Promise<void> {
        const prefix = `user:tokens:${userId}:`;
        const keys = await this.redis.keys(`${prefix}*`);
        if (keys.length === 0) return;

        const pipeline = this.redis.pipeline();
        for (const key of keys) {
            const token = key.substring(prefix.length);
            const ttl = await this.redis.ttl(key);
            if (ttl > 0) {
                pipeline.set(`blacklist:${token}`, '1', 'EX', ttl);
            }
            pipeline.del(key);
        }
        await pipeline.exec();
    }

    /**
     * Registra un token activo de un usuario
     * Permite rastrear todos los tokens de un usuario para invalidarlos
     */
    async registerUserToken(userId: string, token: string, expiresIn: number): Promise<void> {
        const key = `user:tokens:${userId}:${token}`;
        await this.redis.set(key, '1', 'EX', expiresIn);
    }

    async onModuleDestroy() {
        await this.redis.quit();
    }
}
