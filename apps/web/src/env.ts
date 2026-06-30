import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  NEXTAUTH_SECRET: z.string().min(1),
  FIREBASE_PROJECT_ID: z.string().min(1),
  FIREBASE_CLIENT_EMAIL: z.string().email(),
  FIREBASE_PRIVATE_KEY: z.string().min(1),
  STRIPE_SECRET_KEY: z.string().startsWith('sk_'),
  AWS_KMS_KEY_ID: z.string().startsWith('arn:aws:kms:'),
  AWS_REGION: z.string().min(1),
  CEREBRAS_API_KEY: z.string().min(1),
});

const isBuildPhase = 
  process.env.npm_lifecycle_event === 'build' || 
  process.env.NEXT_PHASE === 'phase-production-build' ||
  process.env.SKIP_ENV_VALIDATION === 'true';

let envData: z.infer<typeof envSchema>;

if (isBuildPhase) {
  // Bypass validation during NextJS compilation/build phase
  envData = {
    DATABASE_URL: 'postgres://dummy:dummy@dummy:5432/dummy',
    GOOGLE_CLIENT_ID: 'dummy',
    GOOGLE_CLIENT_SECRET: 'dummy',
    NEXTAUTH_SECRET: 'dummy',
    FIREBASE_PROJECT_ID: 'dummy',
    FIREBASE_CLIENT_EMAIL: 'dummy@dummy.com',
    FIREBASE_PRIVATE_KEY: 'dummy',
    STRIPE_SECRET_KEY: 'sk_dummy',
    AWS_KMS_KEY_ID: 'arn:aws:kms:us-east-1:123456789012:key/dummy',
    AWS_REGION: 'us-east-1',
    CEREBRAS_API_KEY: 'dummy',
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
