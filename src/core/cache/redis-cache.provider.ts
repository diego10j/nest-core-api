import { Injectable, Inject } from '@nestjs/common';
import { Redis } from 'ioredis';

import { ICacheProvider } from './cache.interface';

/**
 * Implementación de ICacheProvider usando Redis
 * Sigue DIP - depende de la abstracción ICacheProvider
 */
@Injectable()
export class RedisCacheProvider implements ICacheProvider {
    constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) { }

    async get<T>(key: string): Promise<T | null> {
        try {
            const data = await this.redis.get(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error(`Error getting cache key ${key}:`, error);
            return null;
        }
    }

    async set<T>(key: string, value: T, ttl?: number): Promise<void> {
        try {
            const data = JSON.stringify(value);
            if (ttl) {
                await this.redis.setex(key, ttl, data);
            } else {
                await this.redis.set(key, data);
            }
        } catch (error) {
            console.error(`Error setting cache key ${key}:`, error);
        }
    }

    async del(key: string): Promise<void> {
        try {
            await this.redis.del(key);
        } catch (error) {
            console.error(`Error deleting cache key ${key}:`, error);
        }
    }

    async delPattern(pattern: string): Promise<void> {
        try {
            const keys = await this.redis.keys(pattern);
            if (keys.length > 0) {
                await this.redis.del(...keys);
            }
        } catch (error) {
            console.error(`Error deleting cache pattern ${pattern}:`, error);
        }
    }

    async clear(): Promise<void> {
        try {
            await this.redis.flushdb();
        } catch (error) {
            console.error('Error clearing cache:', error);
        }
    }
}
