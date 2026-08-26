/**
 * Provider Abstraction Layer
 *
 * Reads env vars to select mock vs real providers.
 * All providers follow a common pattern:
 *   - Interface defines the contract
 *   - Mock implementation for development (never reachable in production)
 *   - Real implementation, activated by environment variables
 *
 * A provider whose credentials are absent reports `availability().available === false`
 * and fails the send. It never reports success it did not observe.
 */

export { getSmsProvider, smsAvailability } from './sms';
export { getEmailProvider, emailAvailability } from './email';
export { getWhatsAppProvider, whatsAppAvailability } from './whatsapp';
export { getPushProvider, pushAvailability } from './push';

export type {
    ProviderAvailability,
    ProviderDeliveryState,
    ProviderDispatch,
} from './transport';

export type ProviderResult<T = void> = {
    success: boolean;
    data?: T;
    error?: string;
};
