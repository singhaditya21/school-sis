import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusScreen } from './screens/StatusScreen';

/**
 * Single-screen shell.
 *
 * There is deliberately no navigator, no Stripe provider and no payment route.
 * The previous build wired a Stripe PaymentSheet to an endpoint that created a
 * bare PaymentIntent carrying no invoice or tenant metadata, and no webhook
 * handler recorded `payment_intent.succeeded`. A parent could be charged and
 * the invoice would remain unpaid, so the payment path was removed outright.
 *
 * Do not reintroduce a payment screen here until the backend can reconcile the
 * charge to an invoice (see the notes in StatusScreen).
 */
export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <StatusScreen />
    </SafeAreaProvider>
  );
}
