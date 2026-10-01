import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Redis } from 'ioredis';

import { envs } from '../../../config/envs';
import { DataSourceService } from '../../connection/datasource.service';

export const REQUIRE_MENU_KEY = 'requireMenu';

/** Segundos que se recuerda la respuesta de la BD (un cambio de permisos tarda hasta ese tiempo). */
const CACHE_TTL_SECONDS = 60;

/**
 * Autorización por opción de menú: el endpoint solo lo puede usar quien tenga, en su perfil
 * activo, alguna de las opciones indicadas con @RequireMenu(...), o sea administrador del
 * sistema (admin_usua).
 *
 * Es la misma regla que ya aplica el front al mostrar la pantalla (el menú sale de
 * sis_perfil_opcion), pero ahora también la exige el backend: sin esto, cualquier usuario con
 * sesión podía llamar directamente a un endpoint de administración que su perfil no ve.
 *
 * El perfil se toma del header X-Ide-Perf, que JwtAuthGuard ya validó contra los perfiles del
 * token; aquí además se exige que exista y que pertenezca al usuario.
 *
 * AUTH_GUARD_MODE=warn: solo registra lo que bloquearía (despliegue gradual).
 */
@Injectable()
export class MenuPermissionGuard implements CanActivate {
  private readonly logger = new Logger('MenuPermissionGuard');

  constructor(
    private readonly reflector: Reflector,
    private readonly dataSource: DataSourceService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const paths = this.reflector.getAllAndOverride<string[]>(REQUIRE_MENU_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!paths || paths.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user;
    const route = `${req.method} ${req.originalUrl ?? req.url}`;

    const reason = await this.denialReason(user, req.headers['x-ide-perf'], paths);
    if (!reason) return true;

    const message = `${route} denegado a ${user?.login ?? 'usuario desconocido'}: ${reason}`;
    if (envs.authGuardMode === 'warn') {
      this.logger.warn(`[warn-mode] ${message}; se bloquearía`);
      return true;
    }
    this.logger.warn(message);
    throw new ForbiddenException('No tiene permiso para realizar esta operación');
  }

  /** null si se permite; si no, el motivo. */
  private async denialReason(user: any, perfilHeader: unknown, paths: string[]): Promise<string | null> {
    if (!user) return 'sin sesión';
    if (user.isSuperUser === true) return null;

    const idePerf = Number(Array.isArray(perfilHeader) ? perfilHeader[0] : perfilHeader);
    if (!Number.isInteger(idePerf)) return 'falta el header X-Ide-Perf';
    if (!user.perfiles?.some((p: { ide_perf: number }) => Number(p.ide_perf) === idePerf)) {
      return 'el perfil no pertenece al usuario';
    }

    return (await this.perfilTieneOpcion(idePerf, paths)) ? null : `el perfil ${idePerf} no tiene la opción ${paths.join(' | ')}`;
  }

  private async perfilTieneOpcion(idePerf: number, paths: string[]): Promise<boolean> {
    const cacheKey = `authz:menu:${idePerf}:${paths.join('|')}`;
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached !== null) return cached === '1';
    } catch {
      /* sin caché se consulta la BD */
    }

    const result = await this.dataSource.pool.query(
      `SELECT 1
         FROM sis_perfil_opcion p
         INNER JOIN sis_opcion o ON o.ide_opci = p.ide_opci
        WHERE p.ide_perf = $1
          AND o.tipo_opci = ANY($2::text[])
          AND o.ide_sist = $3
        LIMIT 1`,
      [idePerf, paths, envs.idSistema],
    );
    const allowed = result.rowCount > 0;

    try {
      await this.redis.set(cacheKey, allowed ? '1' : '0', 'EX', CACHE_TTL_SECONDS);
    } catch {
      /* la caché es opcional */
    }
    return allowed;
  }
}
