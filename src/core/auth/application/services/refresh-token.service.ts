import { Injectable, Inject } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * RefreshTokenService — Gestión de refresh tokens con rotación y detección de reuso.
 *
 * Estrategia de seguridad:
 * - Cada refresh token tiene un JTI único almacenado en Redis DB 3.
 * - Al rotar, el token antiguo se marca "revocado" por 5 minutos para detectar reuso.
 * - Si un token revocado es usado nuevamente (ataque de reuso), se invalidan TODOS
 *   los refresh tokens del usuario, forzando un nuevo login.
 *
 * Claves Redis (DB 3):
 *   rt:{jti}                      → userId  (TTL = expiración del token)
 *   rt:revoked:{jti}              → '1'     (TTL = 5 min, ventana de detección)
 *   rt:user:{userId}:{jti}        → '1'     (TTL = expiración, para revocación masiva)
 */
@Injectable()
export class RefreshTokenService {
    private readonly redis: Redis;

    // Ventana de detección de reuso: cuánto tiempo se guarda un token revocado
    private readonly REUSE_DETECTION_TTL = 300; // 5 minutos

    constructor(@Inject('REDIS_CLIENT') redisClient: Redis) {
        this.redis = redisClient.duplicate();
        this.redis.select(3);
    }

    async store(jti: string, userId: string, expiresInSeconds: number): Promise<void> {
        const pipeline = this.redis.pipeline();
        pipeline.set(`rt:${jti}`, userId, 'EX', expiresInSeconds);
        pipeline.set(`rt:user:${userId}:${jti}`, '1', 'EX', expiresInSeconds);
        await pipeline.exec();
    }

    /**
     * Devuelve el estado del token por JTI.
     * - userId presente + isRevoked false → token válido y activo
     * - isRevoked true → token fue usado (rotado) → posible ataque de reuso
     * - userId null + isRevoked false → token expirado o inexistente
     */
    async getStatus(jti: string): Promise<{ userId: string | null; isRevoked: boolean }> {
        const [userId, revoked] = await Promise.all([
            this.redis.get(`rt:${jti}`),
            this.redis.get(`rt:revoked:${jti}`),
        ]);
        return { userId, isRevoked: revoked !== null };
    }

    /**
     * Revoca un token por JTI. Lo marca como revocado para detección de reuso.
     */
    async revoke(jti: string, userId?: string): Promise<void> {
        const resolvedUserId = userId ?? await this.redis.get(`rt:${jti}`);
        const pipeline = this.redis.pipeline();
        pipeline.set(`rt:revoked:${jti}`, '1', 'EX', this.REUSE_DETECTION_TTL);
        pipeline.del(`rt:${jti}`);
        if (resolvedUserId) {
            pipeline.del(`rt:user:${resolvedUserId}:${jti}`);
        }
        await pipeline.exec();
    }

    /**
     * Revoca todos los refresh tokens de un usuario.
     * Usado cuando cambia la contraseña o se detecta un ataque de reuso.
     */
    async revokeAllForUser(userId: string): Promise<void> {
        const prefix = `rt:user:${userId}:`;
        const keys = await this.redis.keys(`${prefix}*`);
        if (keys.length === 0) return;

        const pipeline = this.redis.pipeline();
        for (const key of keys) {
            const jti = key.substring(prefix.length);
            pipeline.set(`rt:revoked:${jti}`, '1', 'EX', this.REUSE_DETECTION_TTL);
            pipeline.del(`rt:${jti}`);
            pipeline.del(key);
        }
        await pipeline.exec();
    }

    async onModuleDestroy() {
        await this.redis.quit();
    }
}
