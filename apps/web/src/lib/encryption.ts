import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const DETERMINISTIC_V1_PREFIX = 'det.v1';
const DETERMINISTIC_V2_PREFIX = 'det.v2';
const RANDOM_V2_PREFIX = 'rnd.v2';
const GENERIC_PURPOSE = 'generic';
const PURPOSE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const BUILD_SECRET = 'dummy-secret-for-build-time-only-32-chars-long-x';

type KeyMaterial = {
    id: string;
    secret: string;
};

type Keyring = {
    current: KeyMaterial;
    previous: KeyMaterial[];
    legacyFallbackInUse: boolean;
};

export type PiiEncryptionKeyStatus = {
    currentKeyId: string;
    previousKeyIds: string[];
    rotationActive: boolean;
    legacyFallbackInUse: boolean;
};

function isBuildPhase(): boolean {
    return process.env.npm_lifecycle_event === 'build' || process.env.NEXT_PHASE === 'phase-production-build';
}

function rejectProductionPlaceholderSecret(name: string, secret: string): void {
    if (process.env.NODE_ENV !== 'production') return;

    const lowered = secret.toLowerCase();
    if (
        lowered.includes('mock') ||
        lowered.includes('dummy') ||
        lowered.includes('changeme') ||
        lowered.includes('build-time') ||
        lowered === 'dev-secret'
    ) {
        throw new Error(`${name} must not use a placeholder value in production.`);
    }
}

function validateSecret(name: string, secret: string | undefined): string {
    if (!secret || secret.length < 32) {
        throw new Error(`${name} environment variable is required and must be at least 32 characters.`);
    }
    rejectProductionPlaceholderSecret(name, secret);
    return secret;
}

function deriveKeyId(secret: string): string {
    return crypto
        .createHash('sha256')
        .update('school-sis:pii:key-id:v1\0')
        .update(secret)
        .digest('hex')
        .slice(0, 16);
}

function material(secret: string): KeyMaterial {
    return { id: deriveKeyId(secret), secret };
}

function getKeyring(): Keyring {
    const configuredCurrent = process.env.PII_ENCRYPTION_KEY;
    const legacyFallback = process.env.ENCRYPTION_KEY;
    const legacyFallbackInUse = !configuredCurrent && Boolean(legacyFallback);

    if (process.env.NODE_ENV === 'production' && legacyFallbackInUse) {
        throw new Error('PII_ENCRYPTION_KEY is required in production; ENCRYPTION_KEY is not accepted.');
    }

    let currentSecret = configuredCurrent || legacyFallback;
    if (!currentSecret && isBuildPhase()) currentSecret = BUILD_SECRET;
    const current = material(validateSecret('PII_ENCRYPTION_KEY', currentSecret));

    const previousSecret = process.env.PII_ENCRYPTION_PREVIOUS_KEY;
    const previous = previousSecret
        ? [material(validateSecret('PII_ENCRYPTION_PREVIOUS_KEY', previousSecret))]
        : [];

    if (previous.some((key) => key.id === current.id)) {
        throw new Error('PII_ENCRYPTION_PREVIOUS_KEY must differ from PII_ENCRYPTION_KEY.');
    }

    return { current, previous, legacyFallbackInUse };
}

function allKeys(keyring: Keyring): KeyMaterial[] {
    return [keyring.current, ...keyring.previous];
}

function keyForId(keyring: Keyring, keyId: string): KeyMaterial {
    const key = allKeys(keyring).find((candidate) => candidate.id === keyId);
    if (!key) throw new Error(`Unknown PII encryption key id: ${keyId}`);
    return key;
}

function assertPurpose(purpose: string): string {
    if (!PURPOSE_PATTERN.test(purpose)) {
        throw new Error('PII encryption purpose must be a lowercase 1-64 character identifier.');
    }
    return purpose;
}

function deriveKey(key: KeyMaterial, label: string, purpose: string): Buffer {
    return crypto
        .createHmac('sha256', key.secret)
        .update(label)
        .update('\0')
        .update(purpose)
        .digest();
}

function legacyRandomKey(key: KeyMaterial): Buffer {
    return crypto.createHash('sha256').update(key.secret).digest();
}

function deterministicEncKey(key: KeyMaterial, purpose: string): Buffer {
    return deriveKey(key, 'pii:deterministic:enc:v2', purpose);
}

function deterministicSivKey(key: KeyMaterial, purpose: string): Buffer {
    return deriveKey(key, 'pii:deterministic:siv:v2', purpose);
}

function legacyDeterministicEncKey(key: KeyMaterial): Buffer {
    return crypto.createHmac('sha256', key.secret).update('pii:deterministic:enc:v1').digest();
}

function legacyDeterministicSivKey(key: KeyMaterial): Buffer {
    return crypto.createHmac('sha256', key.secret).update('pii:deterministic:siv:v1').digest();
}

function deterministicIv(plaintext: string, key: KeyMaterial, purpose: string): Buffer {
    return crypto
        .createHmac('sha256', deterministicSivKey(key, purpose))
        .update(plaintext, 'utf8')
        .digest()
        .subarray(0, 12);
}

function legacyDeterministicIv(plaintext: string, key: KeyMaterial): Buffer {
    return crypto
        .createHmac('sha256', legacyDeterministicSivKey(key))
        .update(plaintext, 'utf8')
        .digest()
        .subarray(0, 12);
}

function encryptDeterministicV2(plaintext: string, key: KeyMaterial, purpose: string): string {
    const iv = deterministicIv(plaintext, key, purpose);
    const cipher = crypto.createCipheriv(ALGORITHM, deterministicEncKey(key, purpose), iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag();

    return `${DETERMINISTIC_V2_PREFIX}:${key.id}:${purpose}:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

function encryptDeterministicV1(plaintext: string, key: KeyMaterial): string {
    const iv = legacyDeterministicIv(plaintext, key);
    const cipher = crypto.createCipheriv(ALGORITHM, legacyDeterministicEncKey(key), iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag();

    return `${DETERMINISTIC_V1_PREFIX}:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

function decryptAuthenticated(
    ivB64: string,
    authTagB64: string,
    encryptedData: string,
    key: Buffer,
): string {
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');
    if (authTag.length !== 16) throw new Error('Invalid authentication tag length');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: 16 });
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

function decryptLegacyDeterministicWithKey(value: string, key: KeyMaterial): string {
    const parts = value.split(':');
    if (parts.length !== 4 || parts[0] !== DETERMINISTIC_V1_PREFIX) {
        throw new Error('Invalid legacy deterministic ciphertext format');
    }
    const iv = Buffer.from(parts[1], 'base64');
    if (iv.length !== 12) throw new Error('Invalid deterministic nonce length');
    const decrypted = decryptAuthenticated(parts[1], parts[2], parts[3], legacyDeterministicEncKey(key));
    if (!crypto.timingSafeEqual(legacyDeterministicIv(decrypted, key), iv)) {
        throw new Error('Deterministic nonce does not commit to the plaintext');
    }
    return decrypted;
}

function decryptWithAvailableKeys<T>(keys: KeyMaterial[], decryptValue: (key: KeyMaterial) => T): T {
    let lastError: unknown = new Error('No PII encryption keys are configured.');
    for (const key of keys) {
        try {
            return decryptValue(key);
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError;
}

/**
 * Deterministically encrypt searchable PII with a versioned key and field domain.
 * Equality is exposed within the same purpose by design; it is not exposed across purposes.
 */
export function encryptDeterministic(plaintext: string, purpose = GENERIC_PURPOSE): string {
    if (!plaintext) return '';
    const keyring = getKeyring();
    return encryptDeterministicV2(plaintext, keyring.current, assertPurpose(purpose));
}

/**
 * Return every ciphertext that can represent a lookup value during a rotation.
 * This includes the current version, the previous key, and unversioned det.v1 values.
 */
export function encryptDeterministicCandidates(plaintext: string, purpose = GENERIC_PURPOSE): string[] {
    if (!plaintext) return [''];
    const keyring = getKeyring();
    const validPurpose = assertPurpose(purpose);
    return Array.from(new Set(allKeys(keyring).flatMap((key) => [
        encryptDeterministicV2(plaintext, key, validPurpose),
        encryptDeterministicV1(plaintext, key),
    ])));
}

/** Strict deterministic decryption for rotation jobs and callers that must fail closed. */
export function decryptDeterministic(value: string): string {
    const parts = value.split(':');
    const keyring = getKeyring();

    if (parts[0] === DETERMINISTIC_V2_PREFIX) {
        if (parts.length !== 6) throw new Error('Invalid deterministic ciphertext format');
        const [, keyId, purpose, ivB64, authTagB64, encryptedData] = parts;
        const validPurpose = assertPurpose(purpose);
        const key = keyForId(keyring, keyId);
        const iv = Buffer.from(ivB64, 'base64');
        if (iv.length !== 12) throw new Error('Invalid deterministic nonce length');
        const decrypted = decryptAuthenticated(
            ivB64,
            authTagB64,
            encryptedData,
            deterministicEncKey(key, validPurpose),
        );
        if (!crypto.timingSafeEqual(deterministicIv(decrypted, key, validPurpose), iv)) {
            throw new Error('Deterministic nonce does not commit to the plaintext');
        }
        return decrypted;
    }

    if (parts[0] === DETERMINISTIC_V1_PREFIX) {
        return decryptWithAvailableKeys(allKeys(keyring), (key) => decryptLegacyDeterministicWithKey(value, key));
    }

    throw new Error('Invalid deterministic ciphertext format');
}

function decryptRandomStrict(ciphertext: string): string {
    const parts = ciphertext.split(':');
    const keyring = getKeyring();

    if (parts[0] === RANDOM_V2_PREFIX) {
        if (parts.length !== 5) throw new Error('Invalid random ciphertext format');
        const [, keyId, ivB64, authTagB64, encryptedData] = parts;
        return decryptAuthenticated(ivB64, authTagB64, encryptedData, legacyRandomKey(keyForId(keyring, keyId)));
    }

    if (parts.length !== 3) throw new Error('Invalid ciphertext format');
    const [ivB64, authTagB64, encryptedData] = parts;
    return decryptWithAvailableKeys(allKeys(keyring), (key) =>
        decryptAuthenticated(ivB64, authTagB64, encryptedData, legacyRandomKey(key)),
    );
}

/** Encrypt non-searchable secrets with a random IV and the current versioned key. */
export function encrypt(plaintext: string): string {
    if (!plaintext) return '';
    const key = getKeyring().current;
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, legacyRandomKey(key), iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag();
    return `${RANDOM_V2_PREFIX}:${key.id}:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

/** Strict decryption for operational tooling. */
export function decryptStrict(ciphertext: string): string {
    if (!ciphertext) return '';
    if (
        ciphertext.startsWith(`${DETERMINISTIC_V1_PREFIX}:`) ||
        ciphertext.startsWith(`${DETERMINISTIC_V2_PREFIX}:`)
    ) {
        return decryptDeterministic(ciphertext);
    }
    return decryptRandomStrict(ciphertext);
}

/** Compatibility decryption for application reads. */
export function decrypt(ciphertext: string): string {
    if (!ciphertext) return '';
    try {
        return decryptStrict(ciphertext);
    } catch (error) {
        console.error('[Encryption] Decryption failed:', error);
        return '[DECRYPTION ERROR]';
    }
}

function normalizeEmail(email: string): string {
    return email.toLowerCase().trim();
}

function normalizePhone(phone: string): string {
    return phone.replace(/[^0-9+]/g, '');
}

function normalizeIdNumber(id: string): string {
    return id.replace(/\s+/g, '').toUpperCase();
}

/** Encrypt a normalised email for storage. */
export function encryptEmail(email: string): string {
    return encryptDeterministic(normalizeEmail(email), 'email');
}

/** Generate all current/previous email ciphertexts for a rotation-safe equality lookup. */
export function encryptEmailCandidates(email: string): string[] {
    return encryptDeterministicCandidates(normalizeEmail(email), 'email');
}

/** Encrypt a normalised phone number for storage. */
export function encryptPhone(phone: string): string {
    return encryptDeterministic(normalizePhone(phone), 'phone');
}

/** Generate all current/previous phone ciphertexts for a rotation-safe equality lookup. */
export function encryptPhoneCandidates(phone: string): string[] {
    return encryptDeterministicCandidates(normalizePhone(phone), 'phone');
}

/** Encrypt a normalised government identifier for storage. */
export function encryptIdNumber(id: string): string {
    return encryptDeterministic(normalizeIdNumber(id), 'id-number');
}

/** Generate all current/previous identifier ciphertexts for a rotation-safe equality lookup. */
export function encryptIdNumberCandidates(id: string): string[] {
    return encryptDeterministicCandidates(normalizeIdNumber(id), 'id-number');
}

/** Decrypt any field helper's output back to its stored canonical value. */
export function decryptField(value: string): string {
    return decrypt(value);
}

/** Read encrypted values during rollout while preserving not-yet-backfilled plaintext. */
export function decryptFieldTolerant(value: string | null | undefined): string {
    if (!value) return '';
    return value.startsWith(`${DETERMINISTIC_V1_PREFIX}:`) || value.startsWith(`${DETERMINISTIC_V2_PREFIX}:`)
        ? decrypt(value)
        : value;
}

/** Non-secret keyring metadata for readiness checks and rotation tooling. */
export function getPiiEncryptionKeyStatus(): PiiEncryptionKeyStatus {
    const keyring = getKeyring();
    return {
        currentKeyId: keyring.current.id,
        previousKeyIds: keyring.previous.map((key) => key.id),
        rotationActive: keyring.previous.length > 0,
        legacyFallbackInUse: keyring.legacyFallbackInUse,
    };
}
