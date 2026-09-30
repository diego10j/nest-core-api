/* eslint-disable no-undef, import/order, @typescript-eslint/no-explicit-any */
import { ModuleRef } from '@nestjs/core';

jest.mock('../../../config/envs', () => ({ envs: { authGuardMode: 'enforce' } }));
jest.mock('../auth.service', () => ({ AuthService: class {} }));

import { envs } from '../../../config/envs';
import { SocketAuthService } from '../application/services/socket-auth.service';

import { createSocketAuthMiddleware } from './socket-auth.middleware';

const fakeSocket = (handshake: any = {}): any => ({
  id: 's1',
  data: {},
  handshake: { auth: {}, headers: {}, ...handshake },
});

describe('SocketAuthService', () => {
  const dbUser = { ide_usua: '7', ide_empr: '1', uuid: 'u-1', nick_usua: 'diego', bloqueado_usua: false };

  const make = (over: { verify?: any; blacklisted?: boolean; user?: any } = {}) => {
    const tokens: any = { verifyToken: over.verify ?? jest.fn(() => ({ id: 'u-1' })) };
    const blacklist: any = { isTokenBlacklisted: jest.fn(async () => over.blacklisted ?? false) };
    const auth: any = { getPwUsuario: jest.fn(async () => (over.user === undefined ? dbUser : over.user)) };
    return new SocketAuthService(tokens, blacklist, auth);
  };

  it('toma la identidad del token y no de lo que declare el cliente', async () => {
    const id = await make().authenticate(fakeSocket({ auth: { token: 'abc', ide_usua: 999 } }));
    expect(id).toEqual({ ide_usua: 7, ide_empr: 1, uuid: 'u-1', login: 'diego' });
  });

  it('acepta el token en el header Authorization', async () => {
    const id = await make().authenticate(fakeSocket({ headers: { authorization: 'Bearer abc' } }));
    expect(id.ide_usua).toBe(7);
  });

  it.each([
    ['sin token', fakeSocket(), {}],
    ['token inválido', fakeSocket({ auth: { token: 'x' } }), { verify: () => { throw new Error('bad'); } }],
    ['token en blacklist', fakeSocket({ auth: { token: 'x' } }), { blacklisted: true }],
    ['usuario inexistente', fakeSocket({ auth: { token: 'x' } }), { user: null }],
    ['usuario bloqueado', fakeSocket({ auth: { token: 'x' } }), { user: { ...dbUser, bloqueado_usua: true } }],
  ])('rechaza: %s', async (_name, socket, over) => {
    await expect(make(over as any).authenticate(socket)).rejects.toThrow();
  });
});

describe('createSocketAuthMiddleware', () => {
  const run = async (authenticate: () => Promise<any>) => {
    const moduleRef = { get: () => ({ authenticate }) } as unknown as ModuleRef;
    const socket = fakeSocket();
    const next = jest.fn();
    await createSocketAuthMiddleware(moduleRef, 'test')(socket, next);
    return { socket, next };
  };

  afterEach(() => {
    (envs as any).authGuardMode = 'enforce';
  });

  it('guarda la identidad en socket.data.user y deja conectar', async () => {
    const { socket, next } = await run(async () => ({ ide_usua: 7 }));
    expect(socket.data.user).toEqual({ ide_usua: 7 });
    expect(next).toHaveBeenCalledWith();
  });

  it('enforce: rechaza la conexión sin token válido', async () => {
    const { next } = await run(async () => {
      throw new Error('Token requerido');
    });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'unauthorized' }));
  });

  it('warn: deja conectar sin identidad', async () => {
    (envs as any).authGuardMode = 'warn';
    const { socket, next } = await run(async () => {
      throw new Error('Token requerido');
    });
    expect(socket.data.user).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });
});
