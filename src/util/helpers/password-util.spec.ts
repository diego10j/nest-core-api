import { generateTemporaryPassword, maskEmail } from './password-util';

describe('generateTemporaryPassword', () => {
  it('genera 12 caracteres con mayúscula, minúscula y número', () => {
    for (let i = 0; i < 200; i++) {
      const p = generateTemporaryPassword();
      expect(p).toHaveLength(12);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[0-9]/);
      expect(p).toMatch(/^[A-Za-z0-9]+$/);
    }
  });

  it('no usa caracteres ambiguos (0 O 1 l I)', () => {
    for (let i = 0; i < 200; i++) expect(generateTemporaryPassword()).not.toMatch(/[01OlI]/);
  });

  it('no se repite entre llamadas y respeta la longitud mínima de 8', () => {
    const set = new Set(Array.from({ length: 500 }, () => generateTemporaryPassword()));
    expect(set.size).toBe(500);
    expect(generateTemporaryPassword(3)).toHaveLength(8);
  });

  it('nunca es la antigua clave por defecto', () => {
    for (let i = 0; i < 200; i++) expect(generateTemporaryPassword()).not.toBe('Temporal1');
  });
});

describe('maskEmail', () => {
  it('oculta el usuario', () => {
    expect(maskEmail('juan.perez@empresa.com')).toBe('j***@empresa.com');
    expect(maskEmail('sin-arroba')).toBe('***');
  });
});
