import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';

export type WebhookDnsLookup = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<ReadonlyArray<{ address: string; family: number }>>;

type WebhookTargetValidationOptions = {
  environment?: string;
  lookup?: WebhookDnsLookup;
};

export type ResolvedWebhookTarget = {
  url: URL;
  address: string;
  family: 4 | 6;
};

export type WebhookHttpResponse = {
  ok: boolean;
  status: number;
  body: string;
};

type WebhookRequestHeadersInput = {
  customHeaders?: Record<string, string> | null;
  event: string;
  eventId: string;
  signature: string;
  idempotencyKey: string;
};

const RESERVED_WEBHOOK_HEADERS = new Set([
  'content-length',
  'content-type',
  'host',
  'idempotency-key',
  'x-school-sis-event',
  'x-school-sis-event-id',
  'x-school-sis-signature',
]);
const MAX_WEBHOOK_RESPONSE_BYTES = 64 * 1024;

function defaultDnsLookup(
  hostname: string,
  options: { all: true; verbatim: true },
) {
  return dnsLookup(hostname, options);
}

function normalizedHostname(hostname: string): string {
  const withoutBrackets = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;
  return withoutBrackets.toLowerCase().replace(/\.+$/, '');
}

function isPublicIpv4(address: string): boolean {
  const octets = address.split('.').map((part) => Number.parseInt(part, 10));
  const [first, second, third] = octets;

  if (first === 0 || first === 10 || first === 127) return false;
  if (first === 100 && second >= 64 && second <= 127) return false;
  if (first === 169 && second === 254) return false;
  if (first === 172 && second >= 16 && second <= 31) return false;
  if (first === 192 && second === 168) return false;
  if (first === 192 && second === 0 && third === 0) return false;
  if (first === 192 && second === 0 && third === 2) return false;
  if (first === 192 && second === 88 && third === 99) return false;
  if (first === 198 && (second === 18 || second === 19)) return false;
  if (first === 198 && second === 51 && third === 100) return false;
  if (first === 203 && second === 0 && third === 113) return false;
  if (first >= 224) return false;

  return true;
}

function expandEmbeddedIpv4(address: string): string | null {
  if (!address.includes('.')) return address;

  const lastColon = address.lastIndexOf(':');
  const ipv4 = address.slice(lastColon + 1);
  if (isIP(ipv4) !== 4) return null;

  const octets = ipv4.split('.').map((part) => Number.parseInt(part, 10));
  const high = ((octets[0] << 8) | octets[1]).toString(16);
  const low = ((octets[2] << 8) | octets[3]).toString(16);
  return `${address.slice(0, lastColon + 1)}${high}:${low}`;
}

function ipv6ToBigInt(address: string): bigint | null {
  const expandedIpv4 = expandEmbeddedIpv4(address.toLowerCase());
  if (!expandedIpv4 || expandedIpv4.includes('%')) return null;

  const halves = expandedIpv4.split('::');
  if (halves.length > 2) return null;

  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  let parts: string[];

  if (halves.length === 2) {
    const missing = 8 - left.length - right.length;
    if (missing < 1) return null;
    parts = [...left, ...Array.from({ length: missing }, () => '0'), ...right];
  } else {
    if (left.length !== 8) return null;
    parts = left;
  }

  let value = 0n;
  for (const part of parts) {
    if (!/^[0-9a-f]{1,4}$/.test(part)) return null;
    value = (value << 16n) | BigInt(Number.parseInt(part, 16));
  }
  return value;
}

function isInIpv6Cidr(address: bigint, base: bigint, prefixLength: number): boolean {
  const shift = BigInt(128 - prefixLength);
  return address >> shift === base >> shift;
}

function isPublicIpv6(address: string): boolean {
  const value = ipv6ToBigInt(address);
  if (value === null) return false;

  // IPv4-mapped IPv6 addresses must inherit the embedded IPv4 classification.
  if (value >> 32n === 0xffffn) {
    const ipv4 = Number(value & 0xffff_ffffn);
    return isPublicIpv4([
      (ipv4 >>> 24) & 0xff,
      (ipv4 >>> 16) & 0xff,
      (ipv4 >>> 8) & 0xff,
      ipv4 & 0xff,
    ].join('.'));
  }

  // The currently allocated public unicast space is 2000::/3. Reject transition,
  // documentation, benchmarking, and deprecated ranges inside that allocation.
  if (value >> 125n !== 1n) return false;
  if (isInIpv6Cidr(value, 0x2001_0000_0000_0000_0000_0000_0000_0000n, 32)) return false;
  if (isInIpv6Cidr(value, 0x2001_0002_0000_0000_0000_0000_0000_0000n, 48)) return false;
  if (isInIpv6Cidr(value, 0x2001_0010_0000_0000_0000_0000_0000_0000n, 28)) return false;
  if (isInIpv6Cidr(value, 0x2001_0020_0000_0000_0000_0000_0000_0000n, 28)) return false;
  if (isInIpv6Cidr(value, 0x2001_0db8_0000_0000_0000_0000_0000_0000n, 32)) return false;
  if (isInIpv6Cidr(value, 0x2002_0000_0000_0000_0000_0000_0000_0000n, 16)) return false;
  if (isInIpv6Cidr(value, 0x3ffe_0000_0000_0000_0000_0000_0000_0000n, 16)) return false;

  return true;
}

export function isPublicWebhookAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family === 6) return isPublicIpv6(address);
  return false;
}

export async function resolveWebhookTarget(
  rawUrl: string,
  options: WebhookTargetValidationOptions = {},
): Promise<ResolvedWebhookTarget> {
  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    throw new Error('Webhook target must be a valid absolute URL.');
  }

  const environment = options.environment ?? process.env.NODE_ENV;
  const allowedProtocols = environment === 'production'
    ? new Set(['https:'])
    : new Set(['http:', 'https:']);
  if (!allowedProtocols.has(target.protocol)) {
    throw new Error(
      environment === 'production'
        ? 'Webhook targets must use HTTPS in production.'
        : 'Webhook targets must use HTTP or HTTPS.',
    );
  }
  if (target.username || target.password) {
    throw new Error('Webhook target URLs cannot contain credentials.');
  }

  const hostname = normalizedHostname(target.hostname);
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new Error('Webhook targets cannot use localhost.');
  }

  const literalFamily = isIP(hostname);
  if (literalFamily !== 0) {
    if (!isPublicWebhookAddress(hostname)) {
      throw new Error('Webhook targets cannot use private or reserved IP addresses.');
    }
    return { url: target, address: hostname, family: literalFamily as 4 | 6 };
  }

  const resolver = options.lookup ?? defaultDnsLookup;
  let addresses: ReadonlyArray<{ address: string; family: number }>;
  try {
    addresses = await resolver(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error('Webhook target hostname could not be resolved.');
  }
  if (addresses.length === 0) {
    throw new Error('Webhook target hostname did not resolve to an address.');
  }
  if (addresses.some(({ address }) => !isPublicWebhookAddress(address))) {
    throw new Error('Webhook target hostname resolves to a private or reserved IP address.');
  }

  const selected = addresses[0];
  const selectedFamily = isIP(selected.address);
  if (selectedFamily !== 4 && selectedFamily !== 6) {
    throw new Error('Webhook target hostname resolved to an invalid IP address.');
  }
  return { url: target, address: selected.address, family: selectedFamily };
}

export async function validateWebhookTargetUrl(
  rawUrl: string,
  options: WebhookTargetValidationOptions = {},
): Promise<URL> {
  return (await resolveWebhookTarget(rawUrl, options)).url;
}

/**
 * Resolve and pin the connection to the validated public address. Keeping the
 * original hostname in the request preserves TLS hostname verification while
 * preventing a second, attacker-controlled DNS lookup from rebinding to a
 * private address between validation and connection.
 */
export async function sendWebhookRequest(
  rawUrl: string,
  body: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<WebhookHttpResponse> {
  const target = await resolveWebhookTarget(rawUrl);
  const hostname = normalizedHostname(target.url.hostname);
  const pinnedLookup: LookupFunction = (_requestedHostname, _options, callback) => {
    callback(null, target.address, target.family);
  };
  const request = target.url.protocol === 'https:' ? httpsRequest : httpRequest;
  const effectiveTimeoutMs = Math.min(Math.max(Math.floor(timeoutMs) || 10_000, 1_000), 30_000);

  return new Promise<WebhookHttpResponse>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      callback();
    };
    const clientRequest = request({
      protocol: target.url.protocol,
      hostname,
      port: target.url.port || undefined,
      path: `${target.url.pathname}${target.url.search}`,
      method: 'POST',
      headers,
      lookup: pinnedLookup,
      agent: false,
      ...(target.url.protocol === 'https:' && isIP(hostname) === 0 ? { servername: hostname } : {}),
    }, (response) => {
      const status = response.statusCode ?? 0;
      if (status >= 300 && status < 400) {
        response.resume();
        finish(() => reject(new Error('Webhook target redirects are not allowed.')));
        return;
      }

      const chunks: Buffer[] = [];
      let receivedBytes = 0;
      response.on('data', (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        receivedBytes += buffer.length;
        if (receivedBytes > MAX_WEBHOOK_RESPONSE_BYTES) {
          response.destroy();
          finish(() => reject(new Error('Webhook response exceeded the allowed size.')));
          return;
        }
        chunks.push(buffer);
      });
      response.on('end', () => finish(() => resolve({
        ok: status >= 200 && status < 300,
        status,
        body: Buffer.concat(chunks).toString('utf8'),
      })));
      response.on('error', (error) => finish(() => reject(error)));
    });
    const deadline = setTimeout(() => {
      clientRequest.destroy(new Error('Webhook delivery timed out.'));
    }, effectiveTimeoutMs);
    deadline.unref?.();
    clientRequest.on('error', (error) => finish(() => reject(error)));
    clientRequest.end(body);
  });
}

export function assertWebhookCustomHeadersAllowed(
  customHeaders?: Record<string, string> | null,
): void {
  for (const [name, value] of Object.entries(customHeaders ?? {})) {
    if (RESERVED_WEBHOOK_HEADERS.has(name.trim().toLowerCase())) {
      throw new Error(`Webhook custom header "${name}" is reserved.`);
    }

    try {
      new Headers([[name, value]]);
    } catch {
      throw new Error(`Webhook custom header "${name}" is invalid.`);
    }
  }
}

export function buildWebhookRequestHeaders({
  customHeaders,
  event,
  eventId,
  signature,
  idempotencyKey,
}: WebhookRequestHeadersInput): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(customHeaders ?? {})) {
    if (!RESERVED_WEBHOOK_HEADERS.has(name.trim().toLowerCase())) {
      headers[name] = value;
    }
  }

  return {
    ...headers,
    'Content-Type': 'application/json',
    'X-School-SIS-Event': event,
    'X-School-SIS-Event-Id': eventId,
    'X-School-SIS-Signature': signature,
    'Idempotency-Key': idempotencyKey,
  };
}
