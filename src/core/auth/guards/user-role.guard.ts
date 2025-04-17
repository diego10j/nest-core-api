import { Reflector } from '@nestjs/core';
import { CanActivate, ExecutionContext, Injectable, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Observable } from 'rxjs';
// import { Request } from 'express';
import { META_ROLES } from '../decorators/role-protected.decorator';

@Injectable()
export class UserRoleGuard implements CanActivate {

  constructor(
    private readonly reflector: Reflector
  ) { }

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    //console.log(context.switchToHttp().getRequest().ip);
    const validRoles: string[] = this.reflector.get(META_ROLES, context.getHandler())
    if (!validRoles) return true;
    if (validRoles.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user;


    // 1. Verificar que el usuario esté autenticado
    if (!user) {
      throw new UnauthorizedException('User not found in request');
    }

    // 2. Si no hay roles requeridos, permitir acceso
    // if (validRoles.length === 0) return true;
    for (const role of user.roles) {
      if (validRoles.includes(role)) {
        return true;
      }
    }

    // 3. Validar acceso a recursos propios (si aplica)
    // if (this.isAccessingOwnResource(req, user.idUser)) {
    //  return true;
    // }

    // 4. Validar roles (versión corregida)
    // Asumiendo que user.role.rolName contiene el nombre del rol (ej: 'admin')
    // if(!validRoles.includes(user.role.rolName as ValidRoles)){
    //  throw new ForbiddenException("You need one rol");
    // }
    throw new ForbiddenException(
      `User ${user.nom_usua} need a valid role: [${validRoles}]`
    );
  }


  // private isAccessingOwnResource(request: Request, userId: number): boolean {
  //   const requestedId = request.params.id;
  //   if (!requestedId) return false;

  //  Comparar el ID del token con el ID solicitado
  //   return parseInt(requestedId, 10) === userId;
  // }

}
