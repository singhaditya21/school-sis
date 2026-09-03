import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function rejectProductionPlaceholderSecret(secret: string): void {
    if (process.env.NODE_ENV !== 'production') return;

    const lowered = secret.toLowerCase();
    if (
        lowered.includes('mock') ||
        lowered.includes('dummy') ||
        lowered.includes('changeme') ||
        lowered.includes('build-time') ||
        lowered === 'dev-secret'
    ) {
        throw new Error('PII_ENCRYPTION_KEY must not use a placeholder value in production.');
    }
}

function getEncryptionSecret(): string {
    const secret = process.env.PII_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
    if (secret && secret.length >= 32) {
        rejectProductionPlaceholderSecret(secret);
        return secret;
    }

    if (process.env.npm_lifecycle_event === 'build' || process.env.NEXT_PHASE === 'phase-production-build') {
        return 'dummy-secret-for-build-time-only-32-chars-long-x';
    }

    throw new Error(
        'PII_ENCRYPTION_KEY environment variable is required and must be at least 32 characters. ' +
        'ENCRYPTION_KEY is supported only as a legacy fallback.'
    );
}

// Derive a proper 32-byte key from the env variable
function getKey(): Buffer {
    return crypto.createHash('sha256').update(getEncryptionSecret()).digest();
}

// ─── Deterministic AEAD (searchable PII) ─────────────────────────────────────
//
// The random-IV `encrypt` above is right for a write-once secret (a TOTP seed) but
// useless for a column you must look up: `WHERE email = ?` cannot match a value that
// re-encrypts differently every time. Searchable PII (email, phone, government id)
// therefore uses DETERMINISTIC authenticated encryption — the same plaintext always
// yields the same ciphertext, so an equality lookup works directly on the ciphertext.
//
// Construction (SIV-style): the 96-bit GCM nonce is a PRF of the plaintext
// (HMAC-SHA256(sivKey, plaintext), truncated), so it is deterministic yet unique per
// distinct value; AES-256-GCM then authenticates. On decrypt the nonce is re-derived
// from the recovered plaintext and compared, so the nonce commits to the plaintext.
// Keys are domain-separated from the legacy key, so the two schemes never share
// material. TRADE-OFF: equality works, but ORDER BY / LIKE / range on the column do
// NOT — those need a separate representation (see the field helpers' callers).
const DETERMINISTIC_PREFIX = 'det.v1';

function getDeterministicEncKey(): Buffer {
    return crypto.createHmac('sha256', getEncryptionSecret()).update('pii:deterministic:enc:v1').digest();
}

function getDeterministicSivKey(): Buffer {
    return crypto.createHmac('sha256', getEncryptionSecret()).update('pii:deterministic:siv:v1').digest();
}

function deterministicIv(plaintext: string): Buffer {
    return crypto.createHmac('sha256', getDeterministicSivKey()).update(plaintext, 'utf8').digest().subarray(0, 12);
}

/**
 * Deterministically encrypt a value so equality lookups work on the ciphertext.
 * Same plaintext + same key → identical output, every time.
 */
export function encryptDeterministic(plaintext: string): string {
    if (!plaintext) return '';

    const iv = deterministicIv(plaintext);
    const cipher = crypto.createCipheriv(ALGORITHM, getDeterministicEncKey(), iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag();

    return `${DETERMINISTIC_PREFIX}:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

/**
 * Decrypt a value produced by {@link encryptDeterministic}. Throws on a malformed
 * value, a failed authentication tag, or a nonce that does not commit to the
 * recovered plaintext.
 */
export function decryptDeterministic(value: string): string {
    const parts = value.split(':');
    if (parts.length !== 4 || parts[0] !== DETERMINISTIC_PREFIX) {
        throw new Error('Invalid deterministic ciphertext format');
    }
    const iv = Buffer.from(parts[1], 'base64');
    const authTag = Buffer.from(parts[2], 'base64');
    if (authTag.length !== 16) throw new Error('Invalid authentication tag length');

    const decipher = crypto.createDecipheriv(ALGORITHM, getDeterministicEncKey(), iv, { authTagLength: 16 });
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(parts[3], 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    // The nonce must be the PRF of the recovered plaintext, or the value was tampered.
    if (!crypto.timingSafeEqual(deterministicIv(decrypted), iv)) {
        throw new Error('Deterministic nonce does not commit to the plaintext');
    }
    return decrypted;
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
        if (ciphertext.startsWith(`${DETERMINISTIC_PREFIX}:`)) {
            return decryptDeterministic(ciphertext);
        }

        const parts = ciphertext.split(':');
        if (parts.length !== 3) {
            throw new Error('Invalid ciphertext format');
        }

        const [ivB64, authTagB64, encryptedData] = parts;
        const iv = Buffer.from(ivB64, 'base64');
        const authTag = Buffer.from(authTagB64, 'base64');
        if (authTag.length !== 16) throw new Error("Invalid authentication tag length");

        const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv, { authTagLength: 16 });
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (error) {
        console.error('[Encryption] Decryption failed:', error);
        return '[DECRYPTION ERROR]';
    }
}

// ─── Searchable-PII field helpers ────────────────────────────────────────────
// Each normalises to a canonical form BEFORE encrypting, so a lookup encrypts the
// query the same way the stored value was encrypted and the equality matches. They
// use deterministic encryption; the column loses ORDER BY / LIKE, which its read
// sites must account for (display and equality only).

/** Encrypt a normalised (lowercased, trimmed) email for storage or equality lookup. */
export function encryptEmail(email: string): string {
    return encryptDeterministic(email.toLowerCase().trim());
}

/** Encrypt a normalised (digits and leading +) phone number. */
export function encryptPhone(phone: string): string {
    return encryptDeterministic(phone.replace(/[^0-9+]/g, ''));
}

/** Encrypt a normalised government identifier (Aadhaar / APAAR: no spaces, upper-case). */
export function encryptIdNumber(id: string): string {
    return encryptDeterministic(id.replace(/\s+/g, '').toUpperCase());
}

/** Decrypt any field helper's output back to its stored canonical value. */
export function decryptField(value: string): string {
    return decrypt(value);
}

/**
 * Tolerant read for a column mid-transition: a `det.v1:` value is decrypted, a raw
 * plaintext value (not yet backfilled) is returned unchanged. Use this to read a
 * column while encrypt-on-write is rolling out and before the backfill completes.
 */
export function decryptFieldTolerant(value: string | null | undefined): string {
    if (!value) return '';
    return value.startsWith(`${DETERMINISTIC_PREFIX}:`) ? decrypt(value) : value;
}
