import { encryptEmail, decryptFieldTolerant, encryptDeterministic } from '@/lib/encryption';

/**
 * Login correctness for the encrypted users.email (migration 0013).
 *
 * Every auth/SCIM lookup now matches `email_enc = encryptEmail(input)`. Sign-in only
 * works if encryptEmail(the login input) is byte-identical to encryptEmail(the email
 * that was stored) for the same address — regardless of the casing/whitespace the user
 * typed. These tests pin exactly that invariant.
 */
describe('users.email login lookup consistency', () => {
  it('a login input matches the stored value across casing and whitespace', () => {
    const stored = encryptEmail('Admin@School.EDU');
    expect(encryptEmail('admin@school.edu')).toBe(stored);
    expect(encryptEmail('  ADMIN@school.edu  ')).toBe(stored);
    expect(encryptEmail('admin@school.edu\n')).toBe(stored);
  });

  it('different addresses never collide', () => {
    expect(encryptEmail('a@x.com')).not.toBe(encryptEmail('b@x.com'));
  });

  it('round-trips back to the normalised address for display/session', () => {
    expect(decryptFieldTolerant(encryptEmail('Admin@School.EDU'))).toBe('admin@school.edu');
  });

  it('tolerant read leaves a not-yet-backfilled plaintext email untouched', () => {
    // During rollout, COALESCE(email_enc, email) can still yield a raw plaintext email.
    expect(decryptFieldTolerant('legacy@plaintext.test')).toBe('legacy@plaintext.test');
    // …while an encrypted value decrypts.
    expect(decryptFieldTolerant(encryptEmail('legacy@plaintext.test'))).toBe('legacy@plaintext.test');
  });

  it('email uses the normalising helper, not the raw one (uniqueness index depends on it)', () => {
    // encryptEmail lowercases+trims; encryptDeterministic does not. They must differ for
    // a non-normalised input, which is why the login path must use encryptEmail.
    expect(encryptEmail('Mixed@Case.com')).not.toBe(encryptDeterministic('Mixed@Case.com'));
    expect(encryptEmail('Mixed@Case.com')).toBe(encryptDeterministic('mixed@case.com'));
  });
});
