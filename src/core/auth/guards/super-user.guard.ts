import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

/**
 * Permite el acceso solo a administradores del sistema (flag `admin_usua` del usuario, que el
 * token expone como `isSuperUser`). Debe ir después de la autenticación JWT (`@Auth()`).
 */
@Injectable()
export class SuperUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const user = context.switchToHttp().getRequest().user;
    if (user?.isSuperUser === true) return true;

    throw new ForbiddenException('Esta operación es solo para administradores del sistema');
  }
}
