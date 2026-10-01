import { applyDecorators, UseGuards } from '@nestjs/common';

import { AuthExplicit, JwtAuthGuard } from '../guards/jwt-auth.guard';
import { UserRoleGuard } from '../guards/user-role.guard';
import { ValidRoles } from '../interfaces';

import { RoleProtected } from './role-protected.decorator';

export function Auth(...roles: ValidRoles[]) {
  return applyDecorators(RoleProtected(...roles), AuthExplicit(), UseGuards(JwtAuthGuard, UserRoleGuard));
}
