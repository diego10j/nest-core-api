/* eslint-disable no-undef, import/order */
import { ConflictException } from '@nestjs/common';

// El jest del proyecto no resuelve el alias `src/`: se simulan los módulos que lo usan.
jest.mock('src/common/dto/common-params.dto', () => ({}), { virtual: true });
jest.mock('src/core/connection/datasource.service', () => ({ DataSourceService: class {} }), { virtual: true });
jest.mock('src/core/connection/helpers', () => ({ SelectQuery: class {} }), { virtual: true });

import { ConfiguracionService } from './configuracion.service';
import { decrypt } from './crypto.util';

const CLAVE = Buffer.alloc(32, 3).toString('base64');
const service = () => new ConfiguracionService({} as any);

afterEach(() => { delete process.env.SRI_ENCRYPTION_KEY; });

describe('ConfiguracionService.cifrarClave', () => {
  it('cifra en v3 y el valor se puede descifrar con la misma clave', () => {
    process.env.SRI_ENCRYPTION_KEY = CLAVE;
    const { valor, formato } = service().cifrarClave('mi-api-key-123');
    expect(formato).toBe('v3');
    expect(valor.startsWith('ENC:v3:')).toBe(true);
    expect(valor).not.toContain('mi-api-key-123');
    expect(decrypt(valor)).toBe('mi-api-key-123');
  });

  it('sin SRI_ENCRYPTION_KEY responde 409 y NO cifra con la clave antigua (pública)', () => {
    expect(() => service().cifrarClave('x')).toThrow(ConflictException);
  });
});
