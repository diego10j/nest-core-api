import { Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * RefreshTokenService — Gestión de refresh tokens con rotación y detección de reuso.
 *
 * Estrategia de seguridad:
 * - Cada refresh token tiene un JTI único almacenado en Redis DB 3.
 * - Al rotar, el token antiguo se marca "revocado" y se registra el vínculo
 *   oldJti → newJti (token families) para distinguir reuso legítimo de robo.
 * - Si un token revocado es usado nuevamente SIN vínculo de rotación (ataque de reuso),
 *   se invalidan TODOS los refresh tokens del usuario, forzando un nuevo login.
 * - Si Redis está caído, los métodos de lock/rotación fallan en modo "open" para no
 *   bloquear el refresh de sesiones.
 *
 * Claves Redis (DB 3):
 *   rt:{jti}                      → userId      (TTL = expiración del token)
 *   rt:revoked:{jti}              → '1'         (TTL = 5 min, ventana de detección)
 *   rt:user:{userId}:{jti}        → '1'         (TTL = expiración, para revocación masiva)
 *   rt:rotated:{oldJti}           → newJti      (TTL = 5 min, vínculo de rotación → token families)
 *   rt:lock:{jti}                 → timestamp   (TTL = 5s, lock para evitar concurrencia)
 */
@Injectable()
export class RefreshTokenService {
    private readonly redis: Redis;
    private readonly logger = new Logger(RefreshTokenService.name);

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
     * - isRevoked true → token fue usado (rotado)
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

    /**
     * Adquiere un lock atómico sobre el JTI para evitar procesamiento concurrente.
     * Usa SET NX (solo si no existe) con TTL corto para auto-liberación.
     * Fail-open: si Redis no responde, retorna true para no bloquear el refresh.
     */
    async acquireLock(jti: string, ttlSeconds: number = 5): Promise<boolean> {
        try {
            const result = await this.redis.set(
                `rt:lock:${jti}`,
                Date.now().toString(),
                'EX',
                ttlSeconds,
                'NX',
            );
            return result === 'OK';
        } catch (error) {
            this.logger.error(`Error adquiriendo lock para JTI ${jti}: ${(error as Error).message}`);
            return true; // Fail-open: no bloquear refresh por fallo de Redis
        }
    }

    /**
     * Libera el lock del JTI.
     * Fail-silent: si Redis no responde, el lock expirará por TTL.
     */
    async releaseLock(jti: string): Promise<void> {
        try {
            await this.redis.del(`rt:lock:${jti}`);
        } catch (error) {
            this.logger.error(`Error liberando lock para JTI ${jti}: ${(error as Error).message}`);
        }
    }

    /**
     * Registra el vínculo de rotación oldJti → newJti (token families).
     * Permite distinguir reuso legítimo (refresh concurrente/demorado) de robo de token.
     * Fail-open: si Redis no responde, la detección de reuso asumirá "no rotado".
     */
    async storeRotation(oldJti: string, newJti: string): Promise<void> {
        try {
            await this.redis.set(
                `rt:rotated:${oldJti}`,
                newJti,
                'EX',
                this.REUSE_DETECTION_TTL,
            );
        } catch (error) {
            this.logger.error(`Error guardando rotación ${oldJti} → ${newJti}: ${(error as Error).message}`);
        }
    }

    /**
     * Verifica si un token revocado fue reemplazado por una rotación legítima (token families).
     * true → el token fue rotado, reuso no es robo (ej. refresh concurrente).
     * false → el token fue revocado sin registro de rotación → posible robo.
     * Fail-safe: si Redis falla, retorna true para no activar revokeAllForUser por error.
     */
    async isRotatedToken(jti: string): Promise<boolean> {
        try {
            const result = await this.redis.exists(`rt:rotated:${jti}`);
            return result === 1;
        } catch (error) {
            this.logger.error(`Error verificando rotación de JTI ${jti}: ${(error as Error).message}`);
            return true; // Fail-safe: no activar revokeAllForUser por fallo de Redis
        }
    }

    async onModuleDestroy() {
        await this.redis.quit();
    }
}
