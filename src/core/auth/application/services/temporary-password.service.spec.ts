import { BadRequestException, InternalServerErrorException } from '@nestjs/common';

jest.mock('src/config/envs', () => ({ envs: { appLoginUrl: 'https://erp.test' } }), { virtual: true });
jest.mock('src/core/connection/datasource.service', () => ({ DataSourceService: class {} }), { virtual: true });
jest.mock('src/core/connection/helpers', () => ({
  SelectQuery: class {
    addNumberParam() {}
  },
}), { virtual: true });
jest.mock('src/core/email/config', () => ({ BUILTIN_TEMPLATES: { CREDENCIALES_ACCESO: 'credenciales-acceso' } }), { virtual: true });
jest.mock('src/core/email/services/mail.service', () => ({ MailService: class {} }), { virtual: true });
jest.mock('src/core/email/services/template.service', () => ({ TemplateService: class {} }), { virtual: true });
jest.mock('src/util/helpers/password-util', () => jest.requireActual('../../../../util/helpers/password-util'), { virtual: true });

import { TemporaryPasswordService } from './temporary-password.service';

const build = (usuario: any, sendMail = jest.fn().mockResolvedValue({ success: true })) => {
  const dataSource: any = { createSingleQuery: jest.fn().mockResolvedValue(usuario) };
  const templates: any = { compileBuiltInTemplate: jest.fn().mockResolvedValue('<html></html>') };
  const mail: any = { sendMail };
  return { service: new TemporaryPasswordService(dataSource, mail, templates), templates, mail };
};

const usuario = { nom_usua: 'Ana', nick_usua: 'ana', mail_usua: 'ana@empresa.com', ide_empr: 1 };

describe('TemporaryPasswordService', () => {
  it('rechaza al usuario sin correo válido ANTES de generar nada', async () => {
    const { service, mail } = build({ ...usuario, mail_usua: 'no-es-correo' });
    await expect(service.prepare(5, 'alta')).rejects.toBeInstanceOf(BadRequestException);
    expect(mail.sendMail).not.toHaveBeenCalled();
  });

  it('rechaza usuario inexistente', async () => {
    const { service } = build(undefined);
    await expect(service.prepare(5, 'reseteo')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('envía el correo con la clave y devuelve el correo enmascarado', async () => {
    const { service, templates, mail } = build(usuario);
    const c = await service.prepare(5, 'alta', 'admin');
    expect(c.password).toHaveLength(12);
    expect(c.maskedEmail).toBe('a***@empresa.com');
    expect(mail.sendMail).not.toHaveBeenCalled(); // nada se envía hasta llamar send()
    await c.send();
    expect(templates.compileBuiltInTemplate).toHaveBeenCalledWith(
      'credenciales-acceso',
      expect.objectContaining({ password: c.password, usuario: 'ana', esNuevoUsuario: true, loginUrl: 'https://erp.test' }),
    );
    expect(mail.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ destinatario: 'ana@empresa.com', contenido: '<html></html>' }),
      1,
      'admin',
    );
  });

  it('si el correo falla lanza error sin exponer la contraseña', async () => {
    const { service } = build(usuario, jest.fn().mockRejectedValue(new Error('SMTP caído')));
    const c = await service.prepare(5, 'reseteo');
    const err = await c.send().catch((e) => e);
    expect(err).toBeInstanceOf(InternalServerErrorException);
    expect(JSON.stringify(err.getResponse())).not.toContain(c.password);
  });
});
