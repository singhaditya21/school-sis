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

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error(
    "❌ Invalid or missing environment variables:\n",
    _env.error.format()
  );
  throw new Error("Invalid environment variables. The server will not boot in mock mode.");
}

export const env = _env.data;
