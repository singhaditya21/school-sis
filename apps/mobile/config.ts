import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra || {}) as Record<string, string | undefined>;

export const config = {
  // Internal previews require an explicit backend. Production must never guess a
  // loopback address or silently talk to a developer machine.
  BACKEND_URL: process.env.EXPO_PUBLIC_BACKEND_URL || extra.backendUrl || '',
  STRIPE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || extra.stripePublishableKey || '',
};
