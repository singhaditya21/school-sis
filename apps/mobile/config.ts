import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra || {}) as Record<string, string | undefined>;

const isDevRuntime = typeof __DEV__ !== 'undefined' && __DEV__;

interface ResolvedBackendConfig {
  backendUrl: string | null;
  configError: string | null;
}

function getDevFallbackBackendUrl(): string {
  const hostUri = Constants.expoConfig?.hostUri;
  if (!hostUri) {
    // Local development fallback for Android emulator loopback only in __DEV__
    return 'http://10.0.2.2:3000';
  }

  const ip = hostUri.split(':')[0]?.trim();
  if (!ip) {
    return 'http://10.0.2.2:3000';
  }
  return `http://${ip}:3000`;
}

function resolveBackendConfig(): ResolvedBackendConfig {
  const configured = (process.env.EXPO_PUBLIC_BACKEND_URL || extra.backendUrl || '').trim();

  if (!configured) {
    if (isDevRuntime) {
      return {
        backendUrl: getDevFallbackBackendUrl(),
        configError: null,
      };
    }
    return {
      backendUrl: null,
      configError:
        'EXPO_PUBLIC_BACKEND_URL is not set. Production builds require a valid https:// backend URL.',
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    return {
      backendUrl: null,
      configError: 'EXPO_PUBLIC_BACKEND_URL is not a valid URL.',
    };
  }

  if (parsed.username || parsed.password) {
    return {
      backendUrl: null,
      configError: 'EXPO_PUBLIC_BACKEND_URL must not embed credentials.',
    };
  }

  if (!isDevRuntime && parsed.protocol !== 'https:') {
    return {
      backendUrl: null,
      configError:
        'Refusing cleartext http:// backend URL in production. Set EXPO_PUBLIC_BACKEND_URL to an https:// origin.',
    };
  }

  if (isDevRuntime && parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return {
      backendUrl: null,
      configError: 'EXPO_PUBLIC_BACKEND_URL must use https:// (or http:// in local development).',
    };
  }

  const normalizedPath = parsed.pathname.replace(/\/+$/, '');
  return {
    backendUrl: `${parsed.origin}${normalizedPath}`,
    configError: null,
  };
}

const resolved = resolveBackendConfig();

// No Stripe key is read here on purpose: this app has no payment path.
// See the comment in App.tsx before adding one back.
export const config = {
  IS_DEV: isDevRuntime,
  BACKEND_URL: resolved.backendUrl,
  BACKEND_CONFIG_ERROR: resolved.configError,
};

/**
 * Returns the validated backend URL or throws before any network request or
 * credential transmission can occur over an unconfigured or cleartext channel.
 */
export function requireBackendUrl(): string {
  if (!config.BACKEND_URL) {
    throw new Error(
      config.BACKEND_CONFIG_ERROR ||
        'Backend URL is not configured. Set EXPO_PUBLIC_BACKEND_URL to an https:// URL.',
    );
  }
  if (!config.IS_DEV && !config.BACKEND_URL.startsWith('https://')) {
    throw new Error(
      'Refusing to send credentials over cleartext HTTP in production; https:// is required.',
    );
  }
  return config.BACKEND_URL;
}

/**
 * Resolves a backend-relative URL path strictly against `BACKEND_URL` and enforces
 * both `https:` transport and exact origin pinning before passing to `Linking.openURL`.
 */
export function resolveSafeBackendUrl(targetPath: string): string {
  const backendUrl = requireBackendUrl();
  const trimmed = targetPath.trim();
  if (!trimmed || !trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('\\')) {
    throw new Error('Refusing to open untrusted external link path.');
  }

  let expectedOriginUrl: URL;
  let parsed: URL;
  try {
    expectedOriginUrl = new URL(backendUrl);
    parsed = new URL(trimmed, `${expectedOriginUrl.origin}/`);
  } catch {
    throw new Error('Refusing to open malformed link target.');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Refusing to open non-HTTPS external link.');
  }
  if (parsed.origin !== expectedOriginUrl.origin) {
    throw new Error('Refusing to open link outside configured ScholarMind origin.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Refusing to open link with embedded credentials.');
  }

  return parsed.toString();
}
