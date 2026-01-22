import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '';

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
    console.warn('[Encryption] ENCRYPTION_KEY not set or too short. Using insecure default.');
}

// Derive a proper 32-byte key from the env variable
function getKey(): Buffer {
    return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
}

/**
 * Encrypt PII data (email, phone) using AES-256-GCM
 */
export function encrypt(plaintext: string): string {
    if (!plaintext) return '';

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:ciphertext (all base64)
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

/**
 * Decrypt PII data
 */
export function decrypt(ciphertext: string): string {
    if (!ciphertext) return '';

    try {
        const parts = ciphertext.split(':');
        if (parts.length !== 3) {
            throw new Error('Invalid ciphertext format');
        }

        const [ivB64, authTagB64, encryptedData] = parts;
        const iv = Buffer.from(ivB64, 'base64');
        const authTag = Buffer.from(authTagB64, 'base64');

        const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (error) {
        console.error('[Encryption] Decryption failed:', error);
        return '[DECRYPTION ERROR]';
    }
}

/**
 * Helper to encrypt email
 */
export function encryptEmail(email: string): string {
    return encrypt(email.toLowerCase().trim());
}

/**
 * Helper to encrypt phone
 */
export function encryptPhone(phone: string): string {
    return encrypt(phone.replace(/[^0-9+]/g, ''));
}
