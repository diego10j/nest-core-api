/* eslint-disable no-undef, import/order, @typescript-eslint/no-explicit-any */
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AuthUser } from '../interfaces';

import { validateHeaderIdentity } from './header-identity.validator';

jest.mock('../../../config/envs', () => ({ envs: { authGuardMode: 'enforce' } }));

 
import { JwtAuthGuard } from './jwt-auth.guard';

 
import { envs } from '../../../config/envs';

const user = {
  ide_usua: 7,
  login: 'Diego',
  empresas: [{ ide_empr: 1 }],
  sucursales: [{ ide_sucu: 0 }, { ide_sucu: 1 }],
  perfiles: [{ ide_perf: 3 }],
} as unknown as AuthUser;

describe('validateHeaderIdentity', () => {
  const ok = { 'x-ide-usua': '7', 'x-ide-empr': '1', 'x-ide-sucu': '1', 'x-ide-perf': '3', 'x-login': 'diego' };

  it('acepta headers que coinciden con el token', () => {
    expect(validateHeaderIdentity(ok, user)).toBeNull();
  });

  it('acepta peticiones sin headers de contexto', () => {
    expect(validateHeaderIdentity({}, user)).toBeNull();
  });

  it.each([
    ['x-ide-usua', '8'],
    ['x-login', 'otro'],
    ['x-ide-empr', '2'],
    ['x-ide-sucu', '5'],
    ['x-ide-perf', '9'],
    ['x-ide-empr', 'abc'],
  ])('rechaza %s=%s', (header, value) => {
    expect(validateHeaderIdentity({ ...ok, [header]: value }, user)).not.toBeNull();
  });
});

describe('JwtAuthGuard', () => {
  const makeCtx = (headers: Record<string, string>, type = 'http') => {
    const req: any = { method: 'GET', url: '/x', headers };
    const ctx = {
      getType: () => type,
      getHandler: () => () => undefined,
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
    return { ctx, req };
  };

  const makeGuard = (meta: { public?: boolean; explicit?: boolean }, authenticate: () => Promise<boolean>) => {
    const reflector = {
      getAllAndOverride: (key: string) => (key === 'isPublic' ? meta.public : meta.explicit),
    } as unknown as Reflector;
    const guard = new JwtAuthGuard(reflector);
    // Sustituye la autenticación de passport (super.canActivate) por un stub.
    jest.spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate').mockImplementation(authenticate as any);
    return guard;
  };

  afterEach(() => {
    jest.restoreAllMocks();
    (envs as any).authGuardMode = 'enforce';
  });

  it('deja pasar @Public() sin autenticar', async () => {
    const auth = jest.fn();
    const { ctx } = makeCtx({});
    expect(await makeGuard({ public: true }, auth as any).canActivate(ctx)).toBe(true);
    expect(auth).not.toHaveBeenCalled();
  });

  it('ignora contextos que no son http (websockets)', async () => {
    const { ctx } = makeCtx({}, 'ws');
    expect(await makeGuard({}, jest.fn() as any).canActivate(ctx)).toBe(true);
  });

  it('rechaza sin token válido en modo enforce', async () => {
    const { ctx } = makeCtx({});
    const guard = makeGuard({}, async () => {
      throw new UnauthorizedException();
    });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza con 403 si un header no coincide con el token', async () => {
    const { ctx, req } = makeCtx({ 'x-ide-empr': '99' });
    const guard = makeGuard({}, async () => {
      req.user = user;
      return true;
    });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('autentica una sola vez cuando @Auth() corre después del guard global', async () => {
    const { ctx, req } = makeCtx({ 'x-ide-empr': '1' });
    const auth = jest.fn(async () => {
      req.user = user;
      return true;
    });
    const guard = makeGuard({ explicit: true }, auth);
    await guard.canActivate(ctx);
    await guard.canActivate(ctx);
    expect(auth).toHaveBeenCalledTimes(1);
  });

  it('en modo warn deja pasar pero @Auth() explícito sigue exigiendo token', async () => {
    (envs as any).authGuardMode = 'warn';
    const fail = async () => {
      throw new UnauthorizedException();
    };
    expect(await makeGuard({}, fail).canActivate(makeCtx({}).ctx)).toBe(true);
    jest.restoreAllMocks();
    await expect(makeGuard({ explicit: true }, fail).canActivate(makeCtx({}).ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
