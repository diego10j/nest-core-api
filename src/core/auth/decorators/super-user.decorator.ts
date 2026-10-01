import { applyDecorators, UseGuards } from '@nestjs/common';

import { SuperUserGuard } from '../guards/super-user.guard';

import { Auth } from './auth.decorator';

/** Exige sesión válida y que el usuario sea administrador del sistema (admin_usua). */
export function SuperUser() {
  return applyDecorators(Auth(), UseGuards(SuperUserGuard));
}
