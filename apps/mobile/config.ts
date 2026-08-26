import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra || {}) as Record<string, string | undefined>;

// Dynamically resolve localhost network IP for iOS simulator, Android emulator, or physical devices
const getBackendUrl = () => {
  const hostUri = Constants.expoConfig?.hostUri;
  if (!hostUri) {
    // Default fallback to localhost/Android emulator loopback
    return 'http://10.0.2.2:3000';
  }

  // Extract the IP address (excluding the port if present)
  const ip = hostUri.split(':')[0];
  return `http://${ip}:3000`;
};

// No Stripe key is read here on purpose: this app has no payment path.
// See the comment in App.tsx before adding one back.
export const config = {
  BACKEND_URL: process.env.EXPO_PUBLIC_BACKEND_URL || extra.backendUrl || getBackendUrl(),
};
