import { decrypt, encrypt, encryptEmail, encryptPhone } from '@/lib/encryption';

describe('PII encryption utilities', () => {
    it('round-trips plaintext without exposing it in the ciphertext', () => {
        const plaintext = 'Sensitive Data 123';
        const ciphertext = encrypt(plaintext);

        expect(ciphertext).not.toContain(plaintext);
        expect(ciphertext.split(':')).toHaveLength(3);
        expect(decrypt(ciphertext)).toBe(plaintext);
    });

    it('preserves the empty-value contract', () => {
        expect(encrypt('')).toBe('');
        expect(decrypt('')).toBe('');
    });

    it.each([
        'invalid-ciphertext',
        'invalid:auth:tag',
        `${Buffer.alloc(16).toString('base64')}:${Buffer.alloc(8).toString('base64')}:ciphertext`,
    ])('fails closed for malformed ciphertext: %s', (ciphertext) => {
        expect(decrypt(ciphertext)).toBe('[DECRYPTION ERROR]');
    });

    it('normalizes email addresses before encryption', () => {
        expect(decrypt(encryptEmail('  Test@Example.com  '))).toBe('test@example.com');
    });

    it('normalizes telephone numbers before encryption', () => {
        expect(decrypt(encryptPhone('+1 (234) 567-8900'))).toBe('+12345678900');
    });
});
