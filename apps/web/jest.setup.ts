process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/school_sis_unit';
process.env.DIRECT_URL = process.env.DIRECT_URL || process.env.DATABASE_URL;
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'unit-test-session-secret-32-chars';
process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || 'unit-test-nextauth-secret-32-chars';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'unit-test-encryption-key-32-chars';
process.env.PII_ENCRYPTION_KEY = process.env.PII_ENCRYPTION_KEY || 'unit-test-pii-encryption-key-32-chars';
process.env.JOB_QUEUE_MODE = process.env.JOB_QUEUE_MODE || 'database';
