/**
 * Provider Abstraction Layer
 * 
 * Reads env vars to select mock vs real providers.
 * All providers follow a common pattern:
 *   - Interface defines the contract
 *   - Mock implementation for development
 *   - Real implementation for production
 */

export { getSmsProvider } from './sms';
export { getEmailProvider } from './email';
export { getPaymentProvider } from './payment';

export type ProviderResult<T = void> = {
    success: boolean;
    data?: T;
    error?: string;
};
