import crypto from 'crypto';

const GATE_PASS_VERSION = 'gp1';
const GATE_PASS_DOMAIN = 'school-sis:dismissal-gate-pass:v1';
const DEFAULT_TTL_SECONDS = 18 * 60 * 60; // Same-day campus dismissal validity (18 hours)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export interface GatePassTokenClaims {
    v: 1;
    tid: string;
    sid: string;
    gid: string;
    dt: string;
    exp: number;
}

function getSigningSecret(): string {
    const secret = process.env.GATE_PASS_SECRET || process.env.PAYMENT_LINK_SECRET || process.env.SESSION_SECRET;
    if (!secret || secret.length < 32) {
        if (
            process.env.npm_lifecycle_event === 'build' ||
            process.env.NEXT_PHASE === 'phase-production-build'
        ) {
            return 'dummy-secret-for-build-time-only-32-chars-long-x';
        }
        throw new Error('SESSION_SECRET (min 32 chars) is required to sign digital dismissal gate passes.');
    }
    return secret;
}

function deriveSigningKey(): Buffer {
    return crypto
        .createHmac('sha256', getSigningSecret())
        .update(GATE_PASS_DOMAIN, 'utf8')
        .digest();
}

export function signGatePassToken(input: {
    tenantId: string;
    studentId: string;
    guardianUserId: string;
    validDate: string;
    ttlSeconds?: number;
    nowMs?: number;
}): string {
    const tenantId = input.tenantId.trim().toLowerCase();
    const studentId = input.studentId.trim().toLowerCase();
    const guardianUserId = input.guardianUserId.trim().toLowerCase();
    const validDate = input.validDate.trim();

    if (!UUID_REGEX.test(tenantId) || !UUID_REGEX.test(studentId) || !UUID_REGEX.test(guardianUserId)) {
        throw new Error('Invalid tenant, student, or guardian identifier for gate pass.');
    }
    if (!DATE_REGEX.test(validDate)) {
        throw new Error('Gate pass validDate must be YYYY-MM-DD.');
    }

    const nowSec = Math.floor((input.nowMs ?? Date.now()) / 1000);
    const ttl = Math.max(300, Math.min(input.ttlSeconds ?? DEFAULT_TTL_SECONDS, 7 * 24 * 60 * 60));
    const claims: GatePassTokenClaims = {
        v: 1,
        tid: tenantId,
        sid: studentId,
        gid: guardianUserId,
        dt: validDate,
        exp: nowSec + ttl,
    };

    const payloadB64 = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
    const mac = crypto
        .createHmac('sha256', deriveSigningKey())
        .update(`${GATE_PASS_VERSION}.${payloadB64}`, 'utf8')
        .digest('base64url');

    return `${GATE_PASS_VERSION}.${payloadB64}.${mac}`;
}

export interface VerifyGatePassOptions {
    timeZone?: string;
    expectedDate?: string | null;
    allowDateMismatch?: boolean;
}

export function getCurrentCampusDateIso(
    timeZone = 'Asia/Kolkata',
    nowMs = Date.now(),
): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(new Date(nowMs));
    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;
    if (year && month && day) {
        return `${year}-${month}-${day}`;
    }
    return new Date(nowMs).toISOString().slice(0, 10);
}

export function verifyGatePassToken(
    token: string | null | undefined,
    nowMs = Date.now(),
    options?: VerifyGatePassOptions,
):
    | {
          ok: true;
          tenantId: string;
          studentId: string;
          guardianUserId: string;
          validDate: string;
          expiresAt: number;
      }
    | { ok: false; reason: string } {
    if (!token || typeof token !== 'string') {
        return { ok: false, reason: 'Missing dismissal gate pass token.' };
    }

    const parts = token.trim().split('.');
    if (parts.length !== 3 || parts[0] !== GATE_PASS_VERSION) {
        return { ok: false, reason: 'Invalid gate pass token format.' };
    }

    const [, payloadB64, providedMacB64] = parts;
    if (!payloadB64 || !providedMacB64) {
        return { ok: false, reason: 'Malformed gate pass token.' };
    }

    let providedMac: Buffer;
    try {
        providedMac = Buffer.from(providedMacB64, 'base64url');
    } catch {
        return { ok: false, reason: 'Malformed gate pass signature.' };
    }

    const expectedMac = crypto
        .createHmac('sha256', deriveSigningKey())
        .update(`${GATE_PASS_VERSION}.${payloadB64}`, 'utf8')
        .digest();

    if (
        providedMac.length !== expectedMac.length ||
        !crypto.timingSafeEqual(providedMac, expectedMac)
    ) {
        return { ok: false, reason: 'Cryptographic gate pass signature verification failed.' };
    }

    let parsed: Partial<GatePassTokenClaims>;
    try {
        parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as Partial<GatePassTokenClaims>;
    } catch {
        return { ok: false, reason: 'Invalid gate pass payload.' };
    }

    if (
        parsed.v !== 1 ||
        typeof parsed.tid !== 'string' ||
        typeof parsed.sid !== 'string' ||
        typeof parsed.gid !== 'string' ||
        typeof parsed.dt !== 'string' ||
        typeof parsed.exp !== 'number' ||
        !UUID_REGEX.test(parsed.tid) ||
        !UUID_REGEX.test(parsed.sid) ||
        !UUID_REGEX.test(parsed.gid) ||
        !DATE_REGEX.test(parsed.dt)
    ) {
        return { ok: false, reason: 'Invalid gate pass claims.' };
    }

    const nowSec = Math.floor(nowMs / 1000);
    if (parsed.exp <= nowSec) {
        return { ok: false, reason: 'This dismissal gate pass has expired. Generate a fresh daily pass from the Parent Portal.' };
    }

    if (!options?.allowDateMismatch) {
        const expectedDate =
            options?.expectedDate !== undefined
                ? options.expectedDate
                : getCurrentCampusDateIso(options?.timeZone);
        if (expectedDate && parsed.dt !== expectedDate) {
            return {
                ok: false,
                reason: `This dismissal gate pass was issued for ${parsed.dt} and is valid only for ${expectedDate}. Generate a fresh pass for today.`,
            };
        }
    }

    return {
        ok: true,
        tenantId: parsed.tid.toLowerCase(),
        studentId: parsed.sid.toLowerCase(),
        guardianUserId: parsed.gid.toLowerCase(),
        validDate: parsed.dt,
        expiresAt: parsed.exp,
    };
}

export function deriveShortVerificationCode(token: string, prefix = 'GP'): string {
    const digest = crypto.createHash('sha256').update(token, 'utf8').digest('hex').toUpperCase();
    const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 6; i++) {
        const byte = parseInt(digest.slice(i * 2, i * 2 + 2), 16);
        code += alphabet[byte % alphabet.length];
    }
    return `${prefix}-${code}`;
}

/**
 * Generates a deterministic 21x21 finder-anchored verification matrix from any signed token
 * so web SVGs and React Native views render a crisp cryptographic seal without external QR deps.
 */
export function buildVerificationMatrix(seed: string, size = 21): boolean[][] {
    const digest = crypto.createHash('sha512').update(seed, 'utf8').digest();
    const grid: boolean[][] = Array.from({ length: size }, () => Array<boolean>(size).fill(false));

    const drawFinder = (startR: number, startC: number) => {
        for (let r = 0; r < 7; r++) {
            for (let c = 0; c < 7; c++) {
                const isOuter = r === 0 || r === 6 || c === 0 || c === 6;
                const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
                grid[startR + r][startC + c] = isOuter || isInner;
            }
        }
    };

    const isReserved = (r: number, c: number): boolean => {
        if (r < 8 && c < 8) return true;
        if (r < 8 && c >= size - 8) return true;
        if (r >= size - 8 && c < 8) return true;
        if (r === 6 || c === 6) return true;
        return false;
    };

    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);

    for (let i = 8; i < size - 8; i++) {
        grid[6][i] = i % 2 === 0;
        grid[i][6] = i % 2 === 0;
    }

    let bitIndex = 0;
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            if (isReserved(r, c)) continue;
            const byte = digest[Math.floor(bitIndex / 8) % digest.length];
            const bit = (byte >> (bitIndex % 8)) & 1;
            grid[r][c] = bit === 1;
            bitIndex += 1;
        }
    }

    return grid;
}
