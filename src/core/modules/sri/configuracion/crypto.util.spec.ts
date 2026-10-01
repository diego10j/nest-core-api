 
import { decrypt, encrypt, isEncryptionKeyConfigured } from './crypto.util';

// Valor generado con la implementación ORIGINAL (antes de existir v3): debe seguir leyéndose.
const VALOR_V2_ORIGINAL = 'ENC:v2:00112233445566778899aabbccddeeff:966d1e1be40dc90f35b9e250f84ed438e8ef54594ccf5b9726d2024a670adc06';
const CLAVE_A = Buffer.alloc(32, 7).toString('base64');
const CLAVE_B = Buffer.alloc(32, 9).toString('hex');

const conClave = (valor: string | undefined, fn: () => void) => {
  const previo = process.env.SRI_ENCRYPTION_KEY;
  if (valor === undefined) delete process.env.SRI_ENCRYPTION_KEY; else process.env.SRI_ENCRYPTION_KEY = valor;
  try { fn(); } finally {
    if (previo === undefined) delete process.env.SRI_ENCRYPTION_KEY; else process.env.SRI_ENCRYPTION_KEY = previo;
  }
};

describe('crypto.util: sin SRI_ENCRYPTION_KEY todo funciona como antes', () => {
  it('lee un valor v2 generado por la versión original', () => conClave(undefined, () => {
    expect(decrypt(VALOR_V2_ORIGINAL)).toBe('clave-original-123');
  }));
  it('sigue generando v2 y se puede leer', () => conClave(undefined, () => {
    const valor = encrypt('secreto');
    expect(valor.startsWith('ENC:v2:')).toBe(true);
    expect(decrypt(valor)).toBe('secreto');
    expect(isEncryptionKeyConfigured()).toBe(false);
  }));
  it('devuelve tal cual los valores sin cifrar (datos antiguos)', () => conClave(undefined, () => {
    expect(decrypt('texto-plano')).toBe('texto-plano');
    expect(decrypt('')).toBe('');
  }));
});

describe('crypto.util: con SRI_ENCRYPTION_KEY', () => {
  it('cifra en v3 y descifra', () => conClave(CLAVE_A, () => {
    const valor = encrypt('clave-p12 ñ áé 123');
    expect(valor.startsWith('ENC:v3:')).toBe(true);
    expect(valor).not.toContain('clave-p12');
    expect(decrypt(valor)).toBe('clave-p12 ñ áé 123');
    expect(isEncryptionKeyConfigured()).toBe(true);
  }));
  it('cada cifrado produce un resultado distinto (IV aleatorio)', () => conClave(CLAVE_A, () => {
    expect(encrypt('x')).not.toBe(encrypt('x'));
  }));
  it('sigue leyendo los valores v2 ya guardados', () => conClave(CLAVE_A, () => {
    expect(decrypt(VALOR_V2_ORIGINAL)).toBe('clave-original-123');
  }));
  it('acepta la clave en hex', () => conClave(CLAVE_B, () => {
    expect(decrypt(encrypt('hex-ok'))).toBe('hex-ok');
  }));
  it('rechaza un valor v3 alterado', () => {
    let valor = '';
    conClave(CLAVE_A, () => { valor = encrypt('no tocar'); });
    const partes = valor.split(':');
    partes[partes.length - 1] = (partes[partes.length - 1][0] === 'a' ? 'b' : 'a') + partes[partes.length - 1].slice(1);
    conClave(CLAVE_A, () => expect(() => decrypt(partes.join(':'))).toThrow(/alterado|incorrecta/));
  });
  it('rechaza un valor cifrado con otra clave', () => {
    let valor = '';
    conClave(CLAVE_A, () => { valor = encrypt('secreto'); });
    conClave(CLAVE_B, () => expect(() => decrypt(valor)).toThrow(/otra clave/));
  });
  it('un valor v3 sin la variable configurada falla con un mensaje claro (no devuelve basura)', () => {
    let valor = '';
    conClave(CLAVE_A, () => { valor = encrypt('secreto'); });
    conClave(undefined, () => expect(() => decrypt(valor)).toThrow(/no está configurada/));
  });
  it('una clave de longitud incorrecta falla al usarla', () => conClave('corta', () => {
    expect(() => encrypt('x')).toThrow(/32 bytes/);
  }));
});
