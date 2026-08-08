export type ProviderFailureOutcome = 'REJECTED' | 'UNKNOWN';

/**
 * A clear 4xx response means the provider rejected the request. Server errors
 * and other non-success statuses can occur after an upstream accepted work, so
 * they require reconciliation and must not be retried automatically.
 */
export function providerFailureOutcomeForHttpStatus(status: number): ProviderFailureOutcome {
    return status >= 400 && status < 500 ? 'REJECTED' : 'UNKNOWN';
}
