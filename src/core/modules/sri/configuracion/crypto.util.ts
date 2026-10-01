import * as crypto from 'node:crypto';

/**
 * Cifrado de secretos guardados en la BD: clave de la firma electrónica del SRI y credenciales
 * de Telegram/Groq.
 *
 * Formatos:
 * - `ENC:v3:<kid>:<iv>:<tag>:<texto>`: AES-256-GCM (detecta alteraciones) con la clave de la
 *   variable de entorno SRI_ENCRYPTION_KEY. `kid` identifica la clave usada.
 * - `ENC:v2:<iv>:<texto>`: AES-256-CBC con la clave antigua escrita en este archivo. Se sigue
 *   LEYENDO para no perder lo ya guardado, pero esa clave es pública (el repo lo es) y no
 *   protege nada: sirve solo para migrar (docs/firma-sri-plan.md, fase C).
 * - Cualquier otro valor se devuelve tal cual (datos guardados antes de existir el cifrado).
 *
 * Compatibilidad: mientras SRI_ENCRYPTION_KEY no esté configurada, encrypt() sigue generando
 * `v2` y todo funciona como antes. Al configurarla, los valores nuevos pasan a `v3` y los `v2`
 * se siguen descifrando.
 */

// ── Formato antiguo (v2) ─────────────────────────────────────
const LEGACY_ALGORITHM = 'aes-256-cbc';
const LEGACY_PREFIX = 'ENC:v2:';
// TODO(fase C): eliminar cuando todos los valores estén migrados a v3.
const LEGACY_SECRET = 'ProErpSriFirmaEncryption2024!!Key';
const LEGACY_KEY = crypto.scryptSync(LEGACY_SECRET, 'sri-firma-salt', 32);

// ── Formato nuevo (v3) ───────────────────────────────────────
const GCM_PREFIX = 'ENC:v3:';
const GCM_ALGORITHM = 'aes-256-gcm';
const ENV_NAME = 'SRI_ENCRYPTION_KEY';

interface Keyring {
    key: Buffer;
    kid: string;
}

let cached: { raw: string; keyring: Keyring } | null = null;

/** Clave de la variable de entorno (32 bytes en base64 o hex), o null si no está configurada. */
function loadKeyring(): Keyring | null {
    const raw = (process.env[ENV_NAME] ?? '').trim();
    if (!raw) return null;
    if (cached?.raw === raw) return cached.keyring;

    const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
    if (key.length !== 32) {
        throw new Error(`${ENV_NAME} inválida: debe tener 32 bytes en base64 o hex (genere una con: openssl rand -base64 32)`);
    }
    const kid = crypto.createHash('sha256').update(key).digest('hex').slice(0, 8);
    cached = { raw, keyring: { key, kid } };
    return cached.keyring;
}

/** true si el cifrado nuevo (v3) está activo; false si todavía se usa la clave antigua. */
function isEncryptionKeyConfigured(): boolean {
    return loadKeyring() !== null;
}

function encryptLegacy(plainText: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(LEGACY_ALGORITHM, LEGACY_KEY, iv);
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return LEGACY_PREFIX + iv.toString('hex') + ':' + encrypted;
}

function decryptLegacy(storedValue: string): string {
    const payload = storedValue.substring(LEGACY_PREFIX.length);
    const separatorIndex = payload.indexOf(':');
    if (separatorIndex === -1) return storedValue;
    const iv = Buffer.from(payload.substring(0, separatorIndex), 'hex');
    const encrypted = payload.substring(separatorIndex + 1);
    const decipher = crypto.createDecipheriv(LEGACY_ALGORITHM, LEGACY_KEY, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

function encrypt(plainText: string): string {
    const keyring = loadKeyring();
    if (!keyring) return encryptLegacy(plainText);

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(GCM_ALGORITHM, keyring.key, iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${GCM_PREFIX}${keyring.kid}:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(storedValue: string): string {
    if (!storedValue) return storedValue;

    if (storedValue.startsWith(LEGACY_PREFIX)) return decryptLegacy(storedValue);

    if (!storedValue.startsWith(GCM_PREFIX)) return storedValue;

    const [kid, ivHex, tagHex, dataHex] = storedValue.substring(GCM_PREFIX.length).split(':');
    if (!kid || !ivHex || !tagHex || dataHex === undefined) {
        throw new Error('Valor cifrado con formato inválido');
    }
    const keyring = loadKeyring();
    if (!keyring) {
        throw new Error(`El valor está cifrado con ${ENV_NAME}, pero esa variable no está configurada`);
    }
    if (keyring.kid !== kid) {
        throw new Error(`El valor fue cifrado con otra clave (${kid}); ${ENV_NAME} actual es ${keyring.kid}`);
    }
    try {
        const decipher = crypto.createDecipheriv(GCM_ALGORITHM, keyring.key, Buffer.from(ivHex, 'hex'));
        decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
        return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
    } catch {
        throw new Error('No se pudo descifrar: el dato fue alterado o la clave es incorrecta');
    }
}

export { encrypt, decrypt, isEncryptionKeyConfigured };
