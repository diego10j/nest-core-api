import * as crypto from 'node:crypto';

const ALGORITHM = 'aes-256-cbc';
const ENC_PREFIX = 'ENC:v2:';
const SECRET = 'ProErpSriFirmaEncryption2024!!Key';
const KEY = crypto.scryptSync(SECRET, 'sri-firma-salt', 32);

function encrypt(plainText: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return ENC_PREFIX + iv.toString('hex') + ':' + encrypted;
}

function decrypt(storedValue: string): string {
    if (!storedValue || !storedValue.startsWith(ENC_PREFIX)) {
        return storedValue;
    }
    const payload = storedValue.substring(ENC_PREFIX.length);
    const separatorIndex = payload.indexOf(':');
    if (separatorIndex === -1) return storedValue;
    const iv = Buffer.from(payload.substring(0, separatorIndex), 'hex');
    const encrypted = payload.substring(separatorIndex + 1);
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

export { encrypt, decrypt };
