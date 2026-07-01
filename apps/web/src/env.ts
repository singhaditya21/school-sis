import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url().optional(),
  SESSION_SECRET: z.string().min(32),
  PII_ENCRYPTION_KEY: z.string().min(32).optional(),
  ENCRYPTION_KEY: z.string().min(32).optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  NEXTAUTH_SECRET: z.string().min(32).optional(),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  FIREBASE_PROJECT_ID: z.string().min(1).optional(),
  FIREBASE_CLIENT_EMAIL: z.string().email().optional(),
  FIREBASE_PRIVATE_KEY: z.string().min(1).optional(),
  STRIPE_SECRET_KEY: z.string().startsWith('sk_').optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().startsWith('pk_').optional(),
  RAZORPAY_KEY_ID: z.string().min(1).optional(),
  RAZORPAY_KEY_SECRET: z.string().min(1).optional(),
  AWS_KMS_KEY_ID: z.string().startsWith('arn:aws:kms:').optional(),
  AWS_REGION: z.string().min(1).optional(),
  AWS_ACCESS_KEY_ID: z.string().min(1).optional(),
  AWS_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  AWS_S3_BUCKET: z.string().min(1).optional(),
  R2_ACCOUNT_ID: z.string().min(1).optional(),
  R2_ACCESS_KEY_ID: z.string().min(1).optional(),
  R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  R2_BUCKET_NAME: z.string().min(1).optional(),
  CEREBRAS_API_KEY: z.string().min(1).optional(),
}).refine(
  (env) => Boolean(env.PII_ENCRYPTION_KEY || env.ENCRYPTION_KEY),
  {
    message: 'PII_ENCRYPTION_KEY or ENCRYPTION_KEY must be set',
    path: ['PII_ENCRYPTION_KEY'],
  },
);

const isBuildPhase = 
  process.env.npm_lifecycle_event === 'build' || 
  process.env.NEXT_PHASE === 'phase-production-build' ||
  process.env.SKIP_ENV_VALIDATION === 'true';

let envData: z.infer<typeof envSchema>;

if (isBuildPhase) {
  // Bypass validation during NextJS compilation/build phase
  envData = {
    DATABASE_URL: 'postgres://dummy:dummy@dummy:5432/dummy',
    SESSION_SECRET: 'dummy_session_secret_32_chars_minimum',
    PII_ENCRYPTION_KEY: 'dummy_pii_encryption_key_32_chars_min',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  };
} else {
  const _env = envSchema.safeParse(process.env);

  if (!_env.success) {
    console.error(
      "❌ Invalid or missing environment variables:\n",
      _env.error.format()
    );
    throw new Error("Invalid environment variables. The server will not boot in mock mode.");
  }
  envData = _env.data;
}

export const env = envData;
