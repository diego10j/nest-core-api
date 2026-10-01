import { ExecutionContext, ForbiddenException, Injectable, Logger, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

import { envs } from '../../../config/envs';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthUser } from '../interfaces';

import { validateHeaderIdentity } from './header-identity.validator';

/** Lo marca @Auth(): aunque el modo global sea 'warn', esos endpoints siempre se exigen. */
export const AUTH_EXPLICIT_KEY = 'authExplicit';
export const AuthExplicit = () => SetMetadata(AUTH_EXPLICIT_KEY, true);

const VERIFIED = Symbol('jwtAuthVerified');

/**
 * Guard JWT global (APP_GUARD). Todo endpoint exige un access token válido salvo los marcados
 * con @Public(). Además valida que los headers X-Ide-* / X-Login coincidan con el token.
 *
 * Modo (env AUTH_GUARD_MODE):
 * - 'enforce' (por defecto): rechaza con 401/403.
 * - 'warn': solo registra en log lo que rechazaría y deja pasar. Sirve para desplegar y detectar
 *   consumidores no contemplados (otros fronts, integraciones) antes de activar el bloqueo.
 *   Los endpoints con @Auth() explícito se exigen siempre.
 *
 * También se usa dentro de @Auth(): si el guard global ya autenticó la petición no vuelve a
 * consultar la BD.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger('JwtAuthGuard');

  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // WebSockets y otros transportes tienen su propia autenticación.
    if (context.getType() !== 'http') return true;

    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const req = context.switchToHttp().getRequest();
    if (req[VERIFIED]) return true;

    const explicit = !!this.reflector.getAllAndOverride<boolean>(AUTH_EXPLICIT_KEY, targets);
    const enforce = explicit || envs.authGuardMode === 'enforce';
    const route = `${req.method} ${req.originalUrl ?? req.url}`;

    try {
      await super.canActivate(context);
    } catch (error) {
      if (enforce) throw error;
      this.logger.warn(`[warn-mode] ${route} sin token válido (${(error as Error).message}); se permitiría rechazar`);
      return true;
    }

    const mismatch = validateHeaderIdentity(req.headers, req.user as AuthUser);
    if (mismatch) {
      if (enforce) throw new ForbiddenException(mismatch);
      this.logger.warn(`[warn-mode] ${route}: ${mismatch}`);
    }

    req[VERIFIED] = true;
    return true;
  }
}
