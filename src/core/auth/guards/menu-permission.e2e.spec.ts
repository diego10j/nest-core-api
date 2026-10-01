/* eslint-disable no-undef, import/order, @typescript-eslint/no-explicit-any */
import { Body, Controller, INestApplication, Module, Post } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PassportModule, PassportStrategy } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { ExtractJwt, Strategy } from 'passport-jwt';
import request from 'supertest';

jest.mock('../../../config/envs', () => ({ envs: { authGuardMode: 'enforce', idSistema: 2 } }));
jest.mock('../../connection/datasource.service', () => ({ DataSourceService: class {} }));

import { envs } from '../../../config/envs';
import { DataSourceService } from '../../connection/datasource.service';
import { RequireMenu } from '../decorators/require-menu.decorator';

import { JwtAuthGuard } from './jwt-auth.guard';

const SECRET = 'secreto-de-prueba';
const RUTA = '/dashboard/sistema/usuarios/list';

class FakeJwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), secretOrKey: SECRET });
  }
  validate(payload: any) { return payload; }
}

@Controller('prueba')
class PruebaController {
  @Post('reset')
  @RequireMenu(RUTA)
  reset(@Body() body: { ide_usua: number }) { return { reseteado: body.ide_usua }; }
}

const query = jest.fn();
const redisStore = new Map<string, string>();
const redis = {
  get: jest.fn(async (k: string) => redisStore.get(k) ?? null),
  set: jest.fn(async (k: string, v: string) => { redisStore.set(k, v); return 'OK'; }),
};

@Module({
  imports: [PassportModule],
  controllers: [PruebaController],
  providers: [
    FakeJwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: DataSourceService, useValue: { pool: { query } } },
    { provide: 'REDIS_CLIENT', useValue: redis },
  ],
})
class PruebaModule {}

describe('@RequireMenu() sobre HTTP real', () => {
  let app: INestApplication;
  const token = (claims: object = {}) =>
    new JwtService({ secret: SECRET }).sign({ ide_usua: 1, login: 'ana', perfiles: [{ ide_perf: 3 }], empresas: [], sucursales: [], ...claims });

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [PruebaModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
  });
  afterAll(async () => { await app.close(); });
  beforeEach(() => { query.mockReset(); redisStore.clear(); (envs as any).authGuardMode = 'enforce'; });

  const llamar = (t?: string, perfil?: number) => {
    let r = request(app.getHttpServer()).post('/prueba/reset').send({ ide_usua: 9 });
    if (t) r = r.set('Authorization', `Bearer ${t}`);
    if (perfil !== undefined) r = r.set('X-Ide-Perf', String(perfil));
    return r;
  };

  it('sin sesión: 401', async () => { expect((await llamar()).status).toBe(401); });

  it('sin header X-Ide-Perf: 403 y no consulta la BD', async () => {
    expect((await llamar(token())).status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('con un perfil que no es del usuario: 403 (lo rechaza la validación de headers)', async () => {
    expect((await llamar(token(), 99)).status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('perfil propio SIN la opción de menú: 403', async () => {
    query.mockResolvedValue({ rowCount: 0 });
    expect((await llamar(token(), 3)).status).toBe(403);
  });

  it('perfil propio CON la opción de menú: 201, y la consulta usa parámetros', async () => {
    query.mockResolvedValue({ rowCount: 1 });
    const res = await llamar(token(), 3);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ reseteado: 9 });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('$1');
    expect(sql).not.toContain(RUTA);
    expect(params).toEqual([3, [RUTA], 2]);
  });

  it('administrador del sistema: 201 sin consultar la BD', async () => {
    expect((await llamar(token({ isSuperUser: true }), 3)).status).toBe(201);
    expect(query).not.toHaveBeenCalled();
  });

  it('la respuesta de la BD se cachea (segunda llamada sin consulta)', async () => {
    query.mockResolvedValue({ rowCount: 1 });
    await llamar(token(), 3);
    await llamar(token(), 3);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('modo warn: deja pasar lo que bloquearía', async () => {
    (envs as any).authGuardMode = 'warn';
    query.mockResolvedValue({ rowCount: 0 });
    expect((await llamar(token(), 3)).status).toBe(201);
  });
});
