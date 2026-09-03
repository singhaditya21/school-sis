import {
  encrypt,
  decrypt,
  encryptDeterministic,
  decryptDeterministic,
  encryptEmail,
  encryptPhone,
  encryptIdNumber,
  decryptField,
} from '@/lib/encryption';

describe('deterministic PII encryption', () => {
  it('is deterministic: the same plaintext always yields the same ciphertext', () => {
    const a = encryptDeterministic('user@school.edu');
    const b = encryptDeterministic('user@school.edu');
    expect(a).toBe(b);
  });

  it('round-trips and never leaks the plaintext', () => {
    const ct = encryptDeterministic('9876543210');
    expect(ct).not.toContain('9876543210');
    expect(ct.startsWith('det.v1:')).toBe(true);
    expect(ct.split(':')).toHaveLength(4);
    expect(decryptDeterministic(ct)).toBe('9876543210');
    expect(decrypt(ct)).toBe('9876543210'); // decrypt() dispatches on the prefix
  });

  it('gives distinct ciphertext for distinct plaintext', () => {
    expect(encryptDeterministic('a@x.com')).not.toBe(encryptDeterministic('b@x.com'));
  });

  it('supports equality lookup: a query re-encrypts to the stored ciphertext', () => {
    const stored = encryptEmail('  Admin@School.EDU ');
    const query = encryptEmail('admin@school.edu');
    expect(query).toBe(stored); // so `WHERE email = $1` matches
  });

  it('fails closed on a tampered value', () => {
    const ct = encryptDeterministic('sensitive');
    const tampered = ct.slice(0, -2) + (ct.endsWith('A') ? 'B' : 'A');
    expect(() => decryptDeterministic(tampered)).toThrow();
    expect(decrypt(tampered)).toBe('[DECRYPTION ERROR]');
  });

  it('rejects a wrong shape', () => {
    expect(() => decryptDeterministic('det.v1:only:three')).toThrow();
    expect(() => decryptDeterministic('not-deterministic')).toThrow();
  });

  it('preserves the empty-value contract', () => {
    expect(encryptDeterministic('')).toBe('');
    expect(encryptEmail('')).toBe('');
  });
});

describe('field helpers normalise before encrypting', () => {
  it('lowercases + trims email, keeps only digits/+ in phone, upper-cases ids', () => {
    expect(decrypt(encryptEmail('  Jane.Doe@School.edu '))).toBe('jane.doe@school.edu');
    expect(decrypt(encryptPhone('+91 (98765) 43210'))).toBe('+919876543210');
    expect(decrypt(encryptIdNumber('1234 5678 9012'))).toBe('123456789012');
    expect(decrypt(encryptIdNumber('apaar-abc'))).toBe('APAAR-ABC');
  });

  it('decryptField reads both deterministic and legacy random-IV values', () => {
    expect(decryptField(encryptEmail('x@y.com'))).toBe('x@y.com');
    expect(decryptField(encrypt('legacy-secret'))).toBe('legacy-secret');
  });
});

describe('legacy random-IV encrypt is untouched', () => {
  it('stays non-deterministic (a fresh IV per call)', () => {
    expect(encrypt('same')).not.toBe(encrypt('same'));
    expect(decrypt(encrypt('same'))).toBe('same');
  });
});
