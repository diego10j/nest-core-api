import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';

import { MenuPermissionGuard, REQUIRE_MENU_KEY } from '../guards/menu-permission.guard';

import { Auth } from './auth.decorator';

/**
 * Exige sesión válida y que el perfil activo del usuario tenga alguna de las opciones de menú
 * indicadas (por su ruta, ej. '/dashboard/sistema/usuarios/list'), o que sea administrador del
 * sistema. Úsese en endpoints de administración que no deben depender solo de que el front
 * oculte la pantalla.
 */
export function RequireMenu(...paths: string[]) {
  return applyDecorators(Auth(), SetMetadata(REQUIRE_MENU_KEY, paths), UseGuards(MenuPermissionGuard));
}
