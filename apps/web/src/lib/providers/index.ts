/**
 * Provider Abstraction Layer
 * 
 * Reads env vars to select mock vs real providers.
 * All providers follow a common pattern:
 *   - Interface defines the contract
 *   - Mock implementation for development
 *   - Real implementation for production
 */

import type { ProviderFailureOutcome } from './outcome';

export { getSmsProvider } from './sms';
export { getEmailProvider } from './email';
export { getWhatsAppProvider } from './whatsapp';
export { getPushProvider } from './push';
export { providerFailureOutcomeForHttpStatus } from './outcome';
export type { ProviderFailureOutcome } from './outcome';

export type ProviderResult<T = void> = {
    success: boolean;
    data?: T;
    error?: string;
    outcome?: ProviderFailureOutcome;
};
