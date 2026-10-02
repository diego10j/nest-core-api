import { BadRequestException } from '@nestjs/common';

jest.mock('src/config/envs', () => ({ envs: { jwtSecret: 'secreto-de-prueba' } }), { virtual: true });
jest.mock('src/core/connection/datasource.service', () => ({ DataSourceService: class {} }), { virtual: true });
jest.mock('src/core/connection/helpers', () => ({
  SelectQuery: class {
    addStringParam() {}
    addNumberParam() {}
    setLazy() {}
  },
}), { virtual: true });
jest.mock('src/core/email/config', () => ({ BUILTIN_TEMPLATES: { CODIGO_RECUPERACION: 'codigo-recuperacion' } }), { virtual: true });
jest.mock('src/core/email/services/mail.service', () => ({ MailService: class {} }), { virtual: true });
jest.mock('src/core/email/services/template.service', () => ({ TemplateService: class {} }), { virtual: true });
jest.mock('../../domain/repositories', () => ({ USER_REPOSITORY: 'USER_REPOSITORY' }));
jest.mock('../../password.service', () => ({ PasswordService: class {} }));
jest.mock('./login-attempts.service', () => ({ LoginAttemptsService: class {} }));
jest.mock('./refresh-token.service', () => ({ RefreshTokenService: class {} }));
jest.mock('./token-blacklist.service', () => ({ TokenBlacklistService: class {} }));

import { FORGOT_PASSWORD_MESSAGE, PasswordRecoveryService } from './password-recovery.service';

/** Redis en memoria con lo mínimo que usa el servicio */
class FakeRedis {
  store = new Map<string, { v: string; ttl: number }>();
  duplicate() { return this; }
  select() { return Promise.resolve('OK'); }
  async set(k: string, v: string, _ex?: string, ttl?: number, nx?: string) {
    if (nx === 'NX' && this.store.has(k)) return null;
    this.store.set(k, { v, ttl: ttl ?? -1 });
    return 'OK';
  }
  async get(k: string) { return this.store.get(k)?.v ?? null; }
  async ttl(k: string) { return this.store.get(k)?.ttl ?? -2; }
  async del(...ks: string[]) { ks.forEach((k) => this.store.delete(k)); return ks.length; }
  multi() {
    const ops: Array<() => Promise<any>> = [];
    const chain: any = {
      get: (k: string) => { ops.push(() => this.get(k)); return chain; },
      del: (k: string) => { ops.push(() => this.del(k)); return chain; },
      exec: async () => { const r: any[] = []; for (const op of ops) r.push([null, await op()]); return r; },
    };
    return chain;
  }
}

const USER = { ide_usua: 7, uuid: 'uuid-7', nom_usua: 'Ana', nick_usua: 'ana', mail_usua: 'ana@empresa.com', ide_empr: 1 };

const build = (rows: any[] = [USER]) => {
  const redis = new FakeRedis();
  const dataSource: any = {
    createSelectQuery: jest.fn().mockResolvedValue(rows),
    createSingleQuery: jest.fn().mockResolvedValue(rows[0]),
  };
  const mail: any = { sendMail: jest.fn().mockResolvedValue({ success: true }) };
  const templates: any = { compileBuiltInTemplate: jest.fn().mockResolvedValue('<html></html>') };
  const passwordService: any = { hashPassword: jest.fn().mockResolvedValue('HASH') };
  const userRepo: any = { updatePassword: jest.fn(), clearPasswordChangeFlag: jest.fn() };
  const blacklist: any = { blacklistAllUserTokens: jest.fn() };
  const refresh: any = { revokeAllForUser: jest.fn() };
  const attempts: any = { resetFailedAttempts: jest.fn() };
  const service = new PasswordRecoveryService(
    redis as any, dataSource, mail, templates, passwordService, userRepo, blacklist, refresh, attempts,
  );
  const codeSent = () => templates.compileBuiltInTemplate.mock.calls[0][1].codigo as string;
  return { service, redis, mail, templates, userRepo, blacklist, refresh, attempts, passwordService, codeSent };
};

describe('PasswordRecoveryService', () => {
  it('responde lo mismo si la cuenta no existe y no envía nada', async () => {
    const { service, mail } = build([]);
    await expect(service.requestCode('nadie')).resolves.toEqual({ message: FORGOT_PASSWORD_MESSAGE });
    expect(mail.sendMail).not.toHaveBeenCalled();
  });

  it('no envía si hay varias cuentas con el mismo dato (ambiguo) ni si no hay correo válido', async () => {
    const a = build([USER, { ...USER, ide_usua: 8 }]);
    await a.service.requestCode('ana@empresa.com');
    expect(a.mail.sendMail).not.toHaveBeenCalled();
    const b = build([{ ...USER, mail_usua: 'sin-correo' }]);
    await b.service.requestCode('ana');
    expect(b.mail.sendMail).not.toHaveBeenCalled();
  });

  it('envía un código de 6 dígitos, lo guarda hasheado y limita a una solicitud por minuto', async () => {
    const { service, mail, redis, codeSent } = build();
    await service.requestCode('ana');
    expect(mail.sendMail).toHaveBeenCalledTimes(1);
    const code = codeSent();
    expect(code).toMatch(/^\d{6}$/);
    expect(await redis.get('pwdrec:code:7')).not.toContain(code);
    await service.requestCode('ana'); // dentro del minuto: no reenvía
    expect(mail.sendMail).toHaveBeenCalledTimes(1);
  });

  it('si el correo falla, descarta el código y no informa al cliente', async () => {
    const { service, mail, redis } = build();
    mail.sendMail.mockRejectedValue(new Error('SMTP'));
    await expect(service.requestCode('ana')).resolves.toEqual({ message: FORGOT_PASSWORD_MESSAGE });
    expect(await redis.get('pwdrec:code:7')).toBeNull();
  });

  it('código correcto -> resetToken; el código es de un solo uso', async () => {
    const { service, codeSent } = build();
    await service.requestCode('ana');
    const code = codeSent();
    const { resetToken } = await service.verifyCode('ana', code);
    expect(resetToken).toMatch(/^[0-9a-f]{64}$/);
    await expect(service.verifyCode('ana', code)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('código incorrecto: error y se bloquea tras 5 intentos aunque luego acierte', async () => {
    const { service, codeSent } = build();
    await service.requestCode('ana');
    const code = codeSent();
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await expect(service.verifyCode('ana', wrong)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.verifyCode('ana', code)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('nueva contraseña: guarda, quita el cambio obligatorio, cierra sesiones y consume el token', async () => {
    const { service, codeSent, userRepo, blacklist, refresh, attempts, passwordService } = build();
    await service.requestCode('ana');
    const { resetToken } = await service.verifyCode('ana', codeSent());
    await expect(service.resetPassword(resetToken, 'Nueva123', 'Otra1234')).rejects.toBeInstanceOf(BadRequestException);
    await service.resetPassword(resetToken, 'Nueva123', 'Nueva123');
    expect(passwordService.hashPassword).toHaveBeenCalledWith('Nueva123');
    expect(userRepo.updatePassword).toHaveBeenCalledWith(7, 'HASH');
    expect(userRepo.clearPasswordChangeFlag).toHaveBeenCalledWith(7);
    expect(blacklist.blacklistAllUserTokens).toHaveBeenCalledWith('uuid-7');
    expect(refresh.revokeAllForUser).toHaveBeenCalledWith('uuid-7');
    expect(attempts.resetFailedAttempts).toHaveBeenCalled();
    await expect(service.resetPassword(resetToken, 'Nueva123', 'Nueva123')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('un resetToken inventado no sirve', async () => {
    const { service } = build();
    await expect(service.resetPassword('a'.repeat(64), 'Nueva123', 'Nueva123')).rejects.toBeInstanceOf(BadRequestException);
  });
});
