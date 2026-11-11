import crypto from 'crypto';

const PAYMENT_LINK_VERSION = 'v1';
const PAYMENT_LINK_DOMAIN = 'school-sis:whatsapp-pay-link:v1';
const DEFAULT_TTL_SECONDS = 14 * 24 * 60 * 60; // 14 days
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface InvoicePaymentTokenClaims {
    v: 1;
    tid: string;
    iid: string;
    exp: number;
}

function getSigningSecret(): string {
    const secret = process.env.PAYMENT_LINK_SECRET || process.env.SESSION_SECRET;
    if (!secret || secret.length < 32) {
        if (
            process.env.npm_lifecycle_event === 'build' ||
            process.env.NEXT_PHASE === 'phase-production-build'
        ) {
            return 'dummy-secret-for-build-time-only-32-chars-long-x';
        }
        throw new Error('SESSION_SECRET (min 32 chars) is required to sign invoice payment links.');
    }
    return secret;
}

function deriveSigningKey(): Buffer {
    return crypto
        .createHmac('sha256', getSigningSecret())
        .update(PAYMENT_LINK_DOMAIN, 'utf8')
        .digest();
}

export function signInvoicePaymentToken(input: {
    tenantId: string;
    invoiceId: string;
    ttlSeconds?: number;
    nowMs?: number;
}): string {
    const tenantId = input.tenantId.trim().toLowerCase();
    const invoiceId = input.invoiceId.trim().toLowerCase();
    if (!UUID_REGEX.test(tenantId) || !UUID_REGEX.test(invoiceId)) {
        throw new Error('Invalid tenant or invoice identifier for payment link.');
    }

    const nowSec = Math.floor((input.nowMs ?? Date.now()) / 1000);
    const ttl = Math.max(300, Math.min(input.ttlSeconds ?? DEFAULT_TTL_SECONDS, 90 * 24 * 60 * 60));
    const claims: InvoicePaymentTokenClaims = {
        v: 1,
        tid: tenantId,
        iid: invoiceId,
        exp: nowSec + ttl,
    };

    const payloadB64 = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
    const mac = crypto
        .createHmac('sha256', deriveSigningKey())
        .update(`${PAYMENT_LINK_VERSION}.${payloadB64}`, 'utf8')
        .digest('base64url');

    return `${PAYMENT_LINK_VERSION}.${payloadB64}.${mac}`;
}

export function verifyInvoicePaymentToken(
    token: string | null | undefined,
    nowMs = Date.now(),
): { ok: true; tenantId: string; invoiceId: string; expiresAt: number } | { ok: false; reason: string } {
    if (!token || typeof token !== 'string') {
        return { ok: false, reason: 'Missing payment link token.' };
    }

    const parts = token.trim().split('.');
    if (parts.length !== 3 || parts[0] !== PAYMENT_LINK_VERSION) {
        return { ok: false, reason: 'Invalid payment link format.' };
    }

    const [, payloadB64, providedMacB64] = parts;
    if (!payloadB64 || !providedMacB64) {
        return { ok: false, reason: 'Malformed payment link token.' };
    }

    let providedMac: Buffer;
    try {
        providedMac = Buffer.from(providedMacB64, 'base64url');
    } catch {
        return { ok: false, reason: 'Malformed payment link signature.' };
    }

    const expectedMac = crypto
        .createHmac('sha256', deriveSigningKey())
        .update(`${PAYMENT_LINK_VERSION}.${payloadB64}`, 'utf8')
        .digest();

    if (
        providedMac.length !== expectedMac.length ||
        !crypto.timingSafeEqual(providedMac, expectedMac)
    ) {
        return { ok: false, reason: 'Payment link signature verification failed.' };
    }

    let parsed: Partial<InvoicePaymentTokenClaims>;
    try {
        parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as Partial<InvoicePaymentTokenClaims>;
    } catch {
        return { ok: false, reason: 'Invalid payment link payload.' };
    }

    if (
        parsed.v !== 1 ||
        typeof parsed.tid !== 'string' ||
        typeof parsed.iid !== 'string' ||
        typeof parsed.exp !== 'number' ||
        !UUID_REGEX.test(parsed.tid) ||
        !UUID_REGEX.test(parsed.iid)
    ) {
        return { ok: false, reason: 'Invalid payment link claims.' };
    }

    const nowSec = Math.floor(nowMs / 1000);
    if (parsed.exp <= nowSec) {
        return { ok: false, reason: 'This payment link has expired. Ask the school office for a fresh link.' };
    }

    return {
        ok: true,
        tenantId: parsed.tid.toLowerCase(),
        invoiceId: parsed.iid.toLowerCase(),
        expiresAt: parsed.exp,
    };
}

export function normalizeWhatsAppDigits(rawPhone: string | null | undefined): string | null {
    if (!rawPhone) return null;
    const digits = rawPhone.replace(/\D/g, '');
    if (!digits) return null;
    if (digits.length === 10) {
        return `91${digits}`;
    }
    if (digits.length >= 11 && digits.length <= 15) {
        return digits;
    }
    return null;
}

export function maskPhoneNumber(rawPhone: string | null | undefined): string | null {
    const digits = normalizeWhatsAppDigits(rawPhone);
    if (!digits || digits.length < 6) return null;
    return `+${digits.slice(0, 2)} ••••••${digits.slice(-4)}`;
}

export function buildWhatsAppFeeMessage(input: {
    schoolName: string;
    studentName: string;
    invoiceNumber: string;
    amountFormatted: string;
    dueDate: string | null;
    paymentUrl: string;
}): string {
    const duePart = input.dueDate ? ` (Due: ${input.dueDate})` : '';
    return [
        `Namaste from *${input.schoolName}*,`,
        '',
        `Fee invoice *${input.invoiceNumber}* for *${input.studentName}* has an outstanding balance of *${input.amountFormatted}*${duePart}.`,
        '',
        `Pay securely in 1 tap via UPI (GPay / PhonePe / Paytm), NetBanking, or Card — an official receipt is issued immediately:`,
        input.paymentUrl,
    ].join('\n');
}

export function buildWhatsAppShareUrl(phone: string | null | undefined, message: string): string {
    const digits = normalizeWhatsAppDigits(phone);
    const encoded = encodeURIComponent(message);
    return digits ? `https://wa.me/${digits}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}
