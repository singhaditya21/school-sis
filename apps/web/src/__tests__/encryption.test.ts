import { encrypt, decrypt, encryptEmail, encryptPhone } from '../lib/encryption';

describe('Encryption Utilities', () => {
    describe('encrypt and decrypt', () => {
        it('should return empty string if input is empty', () => {
            expect(encrypt('')).toBe('');
            expect(decrypt('')).toBe('');
        });

        it('should correctly encrypt and decrypt a string', () => {
            const originalText = 'Sensitive Data 123';
            const ciphertext = encrypt(originalText);

            // Should not be the original text
            expect(ciphertext).not.toBe(originalText);
            // Should have the correct format (iv:authTag:encryptedData)
            expect(ciphertext.split(':').length).toBe(3);

            const decryptedText = decrypt(ciphertext);
            expect(decryptedText).toBe(originalText);
        });

        it('should return [DECRYPTION ERROR] for invalid ciphertext format', () => {
            // Invalid format (not 3 parts separated by ':')
            expect(decrypt('invalid-ciphertext')).toBe('[DECRYPTION ERROR]');
        });

        it('should return [DECRYPTION ERROR] for invalid base64 data', () => {
            // 3 parts, but invalid data
            expect(decrypt('invalid:auth:tag')).toBe('[DECRYPTION ERROR]');
        });
    });

    describe('encryptEmail', () => {
        it('should lowercase and trim email before encrypting', () => {
            const email = '  Test@Example.com  ';
            const encrypted = encryptEmail(email);
            const decrypted = decrypt(encrypted);

            expect(decrypted).toBe('test@example.com');
        });
    });

    describe('encryptPhone', () => {
        it('should extract only digits and + from phone before encrypting', () => {
            const phone = '+1 (234) 567-8900';
            const encrypted = encryptPhone(phone);
            const decrypted = decrypt(encrypted);

            expect(decrypted).toBe('+12345678900');
        });
    });
});
