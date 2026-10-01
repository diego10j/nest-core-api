/* eslint-disable no-undef, import/order, @typescript-eslint/no-explicit-any */
import { BadRequestException } from '@nestjs/common';

// El jest del proyecto no resuelve el alias `src/`: se simulan los módulos que lo usan.
jest.mock('src/core/connection/helpers', () => ({ SelectQuery: class { constructor(public sql: string) {} } }), { virtual: true });
jest.mock('../../../../common/base-service', () => ({ BaseService: class {} }));
jest.mock('../../../connection/datasource.service', () => ({ DataSourceService: class {} }));

import { encrypt } from '../configuracion/crypto.util';

import { FirmaService } from './firma.service';

const CLAVE = 'clave-del-p12-123';
const dtoIn: any = { ideSucu: 1, ideEmpr: 1 };
const filaBd = () => ({ codigoFirma: 5, rutaFirma: 'firma.p12', claveFirma: encrypt(CLAVE), ideSucu: 1 });

function make(opts: { fila?: any; cached?: string | null; keys?: string[] } = {}) {
  const queries: string[] = [];
  const dataSource: any = {
    createSingleQuery: jest.fn(async (q: any) => { queries.push(q.sql); return opts.fila === undefined ? filaBd() : opts.fila; }),
    createQuery: jest.fn(async (q: any) => { queries.push(q.sql); return []; }),
  };
  const redis: any = {
    get: jest.fn(async () => opts.cached ?? null),
    set: jest.fn(async () => 'OK'),
    keys: jest.fn(async () => opts.keys ?? []),
    del: jest.fn(async () => 1),
  };
  return { service: new FirmaService(dataSource, redis), dataSource, redis, queries };
}

describe('FirmaService: la clave de la firma no sale por la API ni se cachea en claro', () => {
  it('getFirma (API) no devuelve claveFirma', async () => {
    const { service } = make();
    const res: any = await service.getFirma(dtoIn);
    expect(res).not.toHaveProperty('claveFirma');
    expect(JSON.stringify(res)).not.toContain(CLAVE);
    expect(res.rutaFirma).toBe('firma.p12');
  });

  it('getFirmas (listado) ni siquiera consulta password_srfid', async () => {
    const { service, queries } = make();
    await service.getFirmas(dtoIn);
    expect(queries[0]).not.toContain('password_srfid');
  });

  it('en Redis se guarda la clave CIFRADA, nunca en claro', async () => {
    const { service, redis } = make();
    await service.getFirmaParaFirmar(dtoIn);
    const [key, valor] = redis.set.mock.calls[0];
    expect(key).toBe('firma_v2_1');
    expect(valor).toContain('ENC:v2:');
    expect(valor).not.toContain(CLAVE);
  });

  it('getFirmaParaFirmar devuelve la clave descifrada (desde la BD)', async () => {
    const { service } = make();
    expect((await service.getFirmaParaFirmar(dtoIn)).claveFirma).toBe(CLAVE);
  });

  it('getFirmaParaFirmar descifra también cuando la fila viene de la caché', async () => {
    const { service, dataSource } = make({ cached: JSON.stringify(filaBd()) });
    expect((await service.getFirmaParaFirmar(dtoIn)).claveFirma).toBe(CLAVE);
    expect(dataSource.createSingleQuery).not.toHaveBeenCalled();
  });

  it('sin firma disponible lanza BadRequest', async () => {
    const { service } = make({ fila: null });
    await expect(service.getFirmaParaFirmar(dtoIn)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('onModuleInit borra la caché antigua (clave en claro) y conserva la nueva', async () => {
    const { service, redis } = make({ keys: ['firma_1', 'firma_2', 'firma_v2_1'] });
    await service.onModuleInit();
    expect(redis.del).toHaveBeenCalledWith('firma_1', 'firma_2');
  });

  it('onModuleInit no falla si Redis no responde', async () => {
    const { service, redis } = make();
    redis.keys.mockRejectedValueOnce(new Error('redis caído'));
    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });
});
