/* eslint-disable no-undef */
import { Body, Controller, INestApplication, Module, Post } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PassportModule, PassportStrategy } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { ExtractJwt, Strategy } from 'passport-jwt';
import request from 'supertest';

jest.mock('../../../config/envs', () => ({ envs: { authGuardMode: 'enforce' } }));

import { SuperUser } from '../decorators/super-user.decorator';

import { JwtAuthGuard } from './jwt-auth.guard';

const SECRET = 'secreto-de-prueba';

class FakeJwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), secretOrKey: SECRET });
  }
  validate(payload: any) { return payload; }
}

@Controller('prueba')
class PruebaController {
  @Post('solo-admin')
  @SuperUser()
  soloAdmin(@Body() body: { password: string }) { return { recibido: body.password }; }
}

@Module({
  imports: [PassportModule],
  controllers: [PruebaController],
  providers: [FakeJwtStrategy, { provide: APP_GUARD, useClass: JwtAuthGuard }],
})
class PruebaModule {}

describe('@SuperUser() sobre HTTP real', () => {
  let app: INestApplication;
  const token = (claims: object) => new JwtService({ secret: SECRET }).sign({ ide_usua: 1, roles: [], ...claims });

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [PruebaModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
  });
  afterAll(async () => { await app.close(); });

  const llamar = (t?: string) => {
    const r = request(app.getHttpServer()).post('/prueba/solo-admin').send({ password: 'x' });
    return t ? r.set('Authorization', `Bearer ${t}`) : r;
  };

  it('sin token: 401', async () => { expect((await llamar()).status).toBe(401); });
  it('token de un usuario normal: 403', async () => {
    expect((await llamar(token({ isSuperUser: false }))).status).toBe(403);
  });
  it('token sin el campo isSuperUser: 403', async () => {
    expect((await llamar(token({}))).status).toBe(403);
  });
  it('token de administrador del sistema: 201', async () => {
    const res = await llamar(token({ isSuperUser: true }));
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ recibido: 'x' });
  });
});
