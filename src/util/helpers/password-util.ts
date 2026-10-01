import { randomInt } from 'crypto';

// Sin caracteres ambiguos (0/O, 1/l/I) para que se pueda leer y teclear desde un correo
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const ALL = UPPER + LOWER + DIGITS;

const pick = (chars: string): string => chars[randomInt(chars.length)];

/**
 * Genera una contraseña temporal aleatoria (CSPRNG) con al menos una mayúscula, una minúscula y
 * un número. Cumple la validación de fortaleza del sistema (mínimo 8, letras y números).
 */
export function generateTemporaryPassword(length = 12): string {
  const size = Math.max(length, 8);
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS)];
  while (chars.length < size) chars.push(pick(ALL));

  // Fisher-Yates con randomInt para no dejar siempre mayúscula/minúscula/número al inicio
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/** "juan.perez@empresa.com" -> "j***@empresa.com" */
export function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain) return '***';
  return `${user.slice(0, 1)}***@${domain}`;
}
