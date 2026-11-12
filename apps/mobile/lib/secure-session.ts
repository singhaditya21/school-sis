/**
 * @module lib/secure-session
 *
 * Shared mobile Bearer-token session coordinator and durable offline roll-call
 * queue store.
 *
 * Security invariants:
 *   1. Bearer tokens remain in volatile memory (or an explicitly registered
 *      hardware-backed secure storage adapter) — never written to unencrypted
 *      Web Storage.
 *   2. Whenever a Bearer token is available, `buildMobileRequestInit` sends
 *      `Authorization: Bearer <token>` with `credentials: 'omit'` rather than
 *      relying on an ambient cross-origin cookie jar.
 *   3. Teacher roll-call batches are persisted across screen/tab unmounts in
 *      module state and mirrored to durable key-value storage when available,
 *      falling back cleanly to memory in test or restricted environments.
 */

export type RollCallStatus = 'PRESENT' | 'ABSENT' | 'LATE';

export interface QueuedAttendanceEntry {
  studentId: string;
  status: RollCallStatus;
}

export interface QueuedAttendanceBatch {
  id: string;
  sectionId: string;
  sectionLabel: string;
  date: string;
  entries: QueuedAttendanceEntry[];
  queuedAt: string;
}

export interface MobileSessionState {
  bearerToken: string | null;
  email: string | null;
  displayName: string | null;
  schoolCode: string | null;
  authenticated: boolean;
}

export interface KeyValueStorageAdapter {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem?(key: string): void | Promise<void>;
}

const OFFLINE_ROLL_CALL_STORAGE_KEY = 'scholarmind.mobile.offline_roll_call_v1';
const MAX_QUEUED_BATCHES = 50;

let sessionState: MobileSessionState = {
  bearerToken: null,
  email: null,
  displayName: null,
  schoolCode: null,
  authenticated: false,
};

let offlineQueueCache: QueuedAttendanceBatch[] | null = null;
let customQueueStorage: KeyValueStorageAdapter | null = null;

const sessionListeners = new Set<(state: MobileSessionState) => void>();
const queueListeners = new Set<(queue: QueuedAttendanceBatch[]) => void>();

function resolveDefaultQueueStorage(): KeyValueStorageAdapter | null {
  if (customQueueStorage) {
    return customQueueStorage;
  }
  try {
    const maybeStorage = (
      globalThis as unknown as {
        localStorage?: {
          getItem?: (key: string) => string | null;
          setItem?: (key: string, value: string) => void;
          removeItem?: (key: string) => void;
        };
      }
    ).localStorage;
    if (
      maybeStorage &&
      typeof maybeStorage.getItem === 'function' &&
      typeof maybeStorage.setItem === 'function'
    ) {
      return {
        getItem: (key: string) => maybeStorage.getItem!(key),
        setItem: (key: string, value: string) => maybeStorage.setItem!(key, value),
        removeItem: maybeStorage.removeItem
          ? (key: string) => maybeStorage.removeItem!(key)
          : undefined,
      };
    }
  } catch {
    // Restricted runtime without Web Storage; use module memory fallback.
  }
  return null;
}

export function registerOfflineQueueStorageAdapter(adapter: KeyValueStorageAdapter | null): void {
  customQueueStorage = adapter;
}

export function getMobileSession(): MobileSessionState {
  return { ...sessionState };
}

export function extractBearerToken(payload: Record<string, unknown>): string | null {
  for (const key of ['token', 'accessToken', 'bearerToken']) {
    const candidate = payload[key];
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return null;
}

export function setMobileSession(update: {
  bearerToken?: string | null;
  email?: string | null;
  displayName?: string | null;
  schoolCode?: string | null;
  authenticated?: boolean;
}): MobileSessionState {
  const nextToken =
    update.bearerToken !== undefined ? update.bearerToken : sessionState.bearerToken;
  sessionState = {
    bearerToken: nextToken && nextToken.trim().length > 0 ? nextToken.trim() : null,
    email: update.email !== undefined ? update.email : sessionState.email,
    displayName: update.displayName !== undefined ? update.displayName : sessionState.displayName,
    schoolCode: update.schoolCode !== undefined ? update.schoolCode : sessionState.schoolCode,
    authenticated:
      update.authenticated !== undefined
        ? update.authenticated
        : Boolean(nextToken && nextToken.trim().length > 0),
  };
  const snapshot = getMobileSession();
  for (const listener of sessionListeners) {
    listener(snapshot);
  }
  return snapshot;
}

export function clearMobileSession(): void {
  sessionState = {
    bearerToken: null,
    email: null,
    displayName: null,
    schoolCode: null,
    authenticated: false,
  };
  const snapshot = getMobileSession();
  for (const listener of sessionListeners) {
    listener(snapshot);
  }
}

export function subscribeMobileSession(
  listener: (state: MobileSessionState) => void,
): () => void {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}

/**
 * Builds `RequestInit` preferring `Authorization: Bearer <token>` with
 * `credentials: 'omit'` whenever a token is present, avoiding ambient cookie jars.
 */
export function buildMobileRequestInit(
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {},
  tokenOverride?: string | null,
): RequestInit {
  const activeToken =
    tokenOverride !== undefined ? tokenOverride : sessionState.bearerToken;
  const headers: Record<string, string> = {
    ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
    ...(init.headers ?? {}),
  };

  return {
    method: init.method ?? 'GET',
    headers,
    ...(init.body !== undefined ? { body: init.body } : {}),
    credentials: activeToken ? 'omit' : 'same-origin',
  };
}

function isValidQueuedBatch(item: unknown): item is QueuedAttendanceBatch {
  if (!item || typeof item !== 'object') return false;
  const record = item as Record<string, unknown>;
  if (
    typeof record.id !== 'string' ||
    typeof record.sectionId !== 'string' ||
    typeof record.sectionLabel !== 'string' ||
    typeof record.date !== 'string' ||
    typeof record.queuedAt !== 'string' ||
    !Array.isArray(record.entries)
  ) {
    return false;
  }
  return record.entries.every((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const e = entry as Record<string, unknown>;
    return (
      typeof e.studentId === 'string' &&
      (e.status === 'PRESENT' || e.status === 'ABSENT' || e.status === 'LATE')
    );
  });
}

function parseSerializedQueue(raw: string | null): QueuedAttendanceBatch[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidQueuedBatch).slice(-MAX_QUEUED_BATCHES);
  } catch {
    return [];
  }
}

export function getOfflineAttendanceQueueSnapshot(): QueuedAttendanceBatch[] {
  if (offlineQueueCache !== null) {
    return [...offlineQueueCache];
  }
  const storage = resolveDefaultQueueStorage();
  if (storage) {
    try {
      const maybeValue = storage.getItem(OFFLINE_ROLL_CALL_STORAGE_KEY);
      if (typeof maybeValue === 'string' || maybeValue === null) {
        offlineQueueCache = parseSerializedQueue(maybeValue);
        return [...offlineQueueCache];
      }
    } catch {
      // Ignore synchronous storage errors; hydrate asynchronously if needed.
    }
  }
  offlineQueueCache = [];
  return [];
}

export async function hydrateOfflineAttendanceQueue(): Promise<QueuedAttendanceBatch[]> {
  const storage = resolveDefaultQueueStorage();
  if (!storage) {
    return getOfflineAttendanceQueueSnapshot();
  }
  try {
    const raw = await storage.getItem(OFFLINE_ROLL_CALL_STORAGE_KEY);
    const loaded = parseSerializedQueue(raw);
    if (offlineQueueCache === null || offlineQueueCache.length === 0) {
      offlineQueueCache = loaded;
      for (const listener of queueListeners) {
        listener([...offlineQueueCache]);
      }
    }
  } catch {
    if (offlineQueueCache === null) {
      offlineQueueCache = [];
    }
  }
  return [...(offlineQueueCache ?? [])];
}

export async function saveOfflineAttendanceQueue(
  nextQueue: QueuedAttendanceBatch[],
): Promise<QueuedAttendanceBatch[]> {
  const bounded = nextQueue.filter(isValidQueuedBatch).slice(-MAX_QUEUED_BATCHES);
  offlineQueueCache = bounded;
  const storage = resolveDefaultQueueStorage();
  if (storage) {
    try {
      if (bounded.length === 0 && storage.removeItem) {
        await storage.removeItem(OFFLINE_ROLL_CALL_STORAGE_KEY);
      } else {
        await storage.setItem(OFFLINE_ROLL_CALL_STORAGE_KEY, JSON.stringify(bounded));
      }
    } catch {
      // Retain in-memory cache when underlying storage quota or permissions fail.
    }
  }
  const snapshot = [...bounded];
  for (const listener of queueListeners) {
    listener(snapshot);
  }
  return snapshot;
}

export async function appendOfflineAttendanceBatch(
  batch: QueuedAttendanceBatch,
): Promise<QueuedAttendanceBatch[]> {
  const current = getOfflineAttendanceQueueSnapshot();
  return saveOfflineAttendanceQueue([...current, batch]);
}

export function subscribeOfflineAttendanceQueue(
  listener: (queue: QueuedAttendanceBatch[]) => void,
): () => void {
  queueListeners.add(listener);
  return () => {
    queueListeners.delete(listener);
  };
}
