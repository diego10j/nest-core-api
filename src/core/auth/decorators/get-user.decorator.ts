import { createParamDecorator, ExecutionContext, InternalServerErrorException } from '@nestjs/common';

export const GetUser = createParamDecorator((data: string, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest();
  const user = req.user;

  if (!user) throw new InternalServerErrorException('Usuario no encontrado');

  return !data ? user : user[data];
});
