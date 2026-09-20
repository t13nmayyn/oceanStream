import { GoogleGenAI } from '@google/genai';

export class GeminiConfigurationError extends Error {
  constructor(message = 'Gemini is not configured: No valid GEMINI_KEY found') {
    super(message);
    this.name = 'GeminiConfigurationError';
  }
}

export class GeminiServiceError extends Error {
  constructor(message = 'Gemini could not generate a response') {
    super(message);
    this.name = 'GeminiServiceError';
  }
}

export interface GeminiCredential {
  keyIndex: number;
  apiKey: string;
  unavailableUntil: number | null;
  reason: string | null;
}

const QUOTA_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour for quota exhaustion
const AUTH_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours for invalid/auth errors

let poolInitialized = false;
let credentials: GeminiCredential[] = [];

export function resetPoolForTesting() {
  poolInitialized = false;
  credentials = [];
}

function initializePool() {
  if (poolInitialized) return;

  const keys: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const key = process.env[`GEMINI_KEY_${i}`]?.trim();
    if (key) {
      keys.push(key);
    }
  }

  // Fallback to GEMINI_API_KEY if no pool keys exist
  if (keys.length === 0) {
    const fallback = process.env.GEMINI_API_KEY?.trim();
    if (fallback) {
      keys.push(fallback);
    }
  }

  if (keys.length === 0) {
    throw new GeminiConfigurationError();
  }

  credentials = keys.map((apiKey, idx) => ({
    keyIndex: idx + 1,
    apiKey,
    unavailableUntil: null,
    reason: null,
  }));

  console.log(`[geminiKeyPool.service] Configured Gemini credentials: ${credentials.length}`);
  poolInitialized = true;
}

export function getEligibleCredentialsCount(): number {
  initializePool();
  const now = Date.now();
  return credentials.filter(c => c.unavailableUntil === null || c.unavailableUntil < now).length;
}

function getNextEligibleCredential(): GeminiCredential | null {
  initializePool();
  const now = Date.now();
  for (const cred of credentials) {
    if (cred.unavailableUntil === null || cred.unavailableUntil < now) {
      // Clear cooldown if it has passed
      if (cred.unavailableUntil !== null) {
        cred.unavailableUntil = null;
        cred.reason = null;
      }
      return cred;
    }
  }
  return null;
}

function classifyError(error: any): { isQuota: boolean; isAuthOrInvalid: boolean; isTransient: boolean } {
  const errMsg = error instanceof Error ? error.message : String(error);
  const status = error?.status || error?.response?.status;

  const is429 = status === 429 || errMsg.includes('429');
  const isQuotaMsg = errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('exhausted');

  const isAuthOrInvalid = 
    status === 401 || 
    status === 403 || 
    status === 404 || 
    errMsg.includes('401') || 
    errMsg.includes('403') || 
    errMsg.includes('404') ||
    errMsg.toLowerCase().includes('permission denied') ||
    errMsg.toLowerCase().includes('model not found') ||
    errMsg.toLowerCase().includes('api key not valid');

  const isTransient = status === 503 || status === 500 || errMsg.toLowerCase().includes('timeout') || (is429 && !isQuotaMsg);

  return {
    isQuota: is429 && isQuotaMsg,
    isAuthOrInvalid: !!isAuthOrInvalid,
    isTransient: !!isTransient,
  };
}

export async function executeWithFailover<T>(
  operation: (ai: GoogleGenAI, keyIndex: number) => Promise<T>
): Promise<T> {
  initializePool();

  const maxAttempts = credentials.length;
  let attempts = 0;
  let lastError: unknown;

  while (attempts < maxAttempts) {
    const cred = getNextEligibleCredential();
    if (!cred) {
      throw new GeminiServiceError('All Gemini credentials are currently unavailable due to quota or auth errors.');
    }

    const ai = new GoogleGenAI({ apiKey: cred.apiKey });

    try {
      const result = await operation(ai, cred.keyIndex);
      return result;
    } catch (error: any) {
      lastError = error;
      const { isQuota, isAuthOrInvalid, isTransient } = classifyError(error);

      if (isQuota) {
        console.warn(`[geminiKeyPool.service] Gemini Key ${cred.keyIndex} -> quota unavailable. Entering cooldown.`);
        cred.unavailableUntil = Date.now() + QUOTA_COOLDOWN_MS;
        cred.reason = 'Quota Exhausted';
      } else if (isAuthOrInvalid) {
        console.warn(`[geminiKeyPool.service] Gemini Key ${cred.keyIndex} -> authentication/permission/model error. Marking unhealthy.`);
        cred.unavailableUntil = Date.now() + AUTH_COOLDOWN_MS;
        cred.reason = 'Auth/Permission Error';
      } else if (isTransient) {
        // Transient errors that bubble up here have already exhausted the inner operation's backoff.
        // We do not burn the key, but we throw the error to fail the request cleanly.
        console.warn(`[geminiKeyPool.service] Gemini Key ${cred.keyIndex} -> retryable transient error exhausted inner backoff. Returning error.`);
        throw error;
      } else {
        // Other unexpected fatal errors
        throw error;
      }
    }

    attempts++;
  }

  throw new GeminiServiceError('Gemini multi-key failover exhausted all configured credentials.');
}
