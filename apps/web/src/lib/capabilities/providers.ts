import type { ProviderRequirement } from './types';

type Environment = Readonly<Record<string, string | undefined>>;

function hasAll(env: Environment, names: readonly string[]): boolean {
    return names.every((name) => Boolean(env[name]?.trim()));
}

function paymentConfigured(env: Environment): boolean {
    return hasAll(env, ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET'])
        || hasAll(env, ['STRIPE_SECRET_KEY']);
}

function messagingConfigured(env: Environment): boolean {
    const emailProvider = env.EMAIL_PROVIDER?.trim().toLowerCase();
    const emailConfigured = emailProvider === 'resend'
        ? hasAll(env, ['RESEND_API_KEY'])
        : emailProvider === 'smtp'
            ? hasAll(env, ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'])
            : false;

    const smsProvider = env.SMS_PROVIDER?.trim().toLowerCase();
    const smsConfigured = smsProvider === 'msg91'
        ? hasAll(env, ['MSG91_AUTH_KEY'])
        : smsProvider === 'twilio'
            ? hasAll(env, ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER'])
            : false;

    return emailConfigured || smsConfigured;
}

export function configuredProviderRequirements(env: Environment = process.env): readonly ProviderRequirement[] {
    const configured: ProviderRequirement[] = [];

    if (env.OPENAI_API_KEY?.trim()) configured.push('AI');
    if (messagingConfigured(env)) configured.push('MESSAGING');
    if (hasAll(env, ['S3_BUCKET_NAME', 'AWS_REGION'])) configured.push('OBJECT_STORAGE');
    if (paymentConfigured(env)) configured.push('PAYMENTS');
    if (hasAll(env, ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'])) configured.push('PUSH');

    return configured;
}
