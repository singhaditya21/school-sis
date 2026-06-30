import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useStripe } from '@stripe/stripe-react-native';
import { config } from '../config';

export function TuitionPaymentScreen({ route }: any) {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [loading, setLoading] = useState(false);
  const params = route?.params || {};
  const invoiceId = params.invoiceId as string | undefined;
  const parentCustomerId = params.parentCustomerId as string | undefined;

  const invoiceAmount = Number(params.invoiceAmount || 0);
  const platformFee = invoiceAmount * 0.015;

  const fetchPaymentSheetParams = async () => {
    if (!invoiceId || !parentCustomerId) {
      throw new Error('Missing invoice or customer context.');
    }

    const response = await fetch(`${config.BACKEND_URL}/api/parent/payment-sheet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        invoiceId,
        parentCustomerId,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Payment sheet request failed.');
    }

    return {
      paymentIntent: data.paymentIntent,
      ephemeralKey: data.ephemeralKey,
      customer: data.customer,
    };
  };

  const initializePaymentSheet = async () => {
    try {
      const { paymentIntent, ephemeralKey, customer } = await fetchPaymentSheetParams();

      const { error } = await initPaymentSheet({
        merchantDisplayName: "School SIS",
        customerId: customer,
        customerEphemeralKeySecret: ephemeralKey || undefined,
        paymentIntentClientSecret: paymentIntent,
        allowsDelayedPaymentMethods: true,
      });
      
      if (!error) {
        setLoading(true);
      }
    } catch (err: any) {
      Alert.alert('Payment unavailable', err.message);
    }
  };

  const openPaymentSheet = async () => {
    // Note: In local development without a real Stripe backend, this will fail gracefully.
    const { error } = await presentPaymentSheet();

    if (error) {
      Alert.alert(`Error code: ${error.code}`, error.message);
    } else {
      Alert.alert('Success', 'Your tuition payment is confirmed!');
    }
  };

  // Run initialization on mount
  React.useEffect(() => {
    if (invoiceId && parentCustomerId) {
      initializePaymentSheet();
    }
  }, [invoiceId, parentCustomerId]);

  if (!invoiceId || !parentCustomerId) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>Payment Unavailable</Text>
          <Text style={styles.term}>Open an authenticated invoice before starting payment.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Outstanding Tuition</Text>
        <Text style={styles.term}>Fall Semester 2026</Text>
        
        <View style={styles.amountContainer}>
          <Text style={styles.currency}>$</Text>
          <Text style={styles.amount}>{invoiceAmount.toLocaleString()}</Text>
          <Text style={styles.cents}>.00</Text>
        </View>

        <View style={styles.breakdown}>
          <View style={styles.row}>
            <Text style={styles.label}>School Tuition</Text>
            <Text style={styles.value}>${(invoiceAmount - platformFee).toFixed(2)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Platform Fee (1.5%)</Text>
            <Text style={styles.value}>${platformFee.toFixed(2)}</Text>
          </View>
        </View>

        <TouchableOpacity 
          style={styles.payButton} 
          onPress={openPaymentSheet}
        >
          <Text style={styles.payButtonText}>Pay Securely with Stripe</Text>
        </TouchableOpacity>
        <Text style={styles.secureText}>Powered by Stripe Connect</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    padding: 20,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 24,
    padding: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 5,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
  },
  term: {
    fontSize: 16,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
  },
  amountContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    marginTop: 30,
    marginBottom: 30,
  },
  currency: {
    fontSize: 24,
    fontWeight: '600',
    color: '#0F172A',
    marginTop: 8,
  },
  amount: {
    fontSize: 56,
    fontWeight: '800',
    color: '#0F172A',
  },
  cents: {
    fontSize: 24,
    fontWeight: '600',
    color: '#0F172A',
    marginTop: 8,
  },
  breakdown: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 20,
    marginBottom: 30,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  label: {
    fontSize: 15,
    color: '#64748B',
  },
  value: {
    fontSize: 15,
    fontWeight: '600',
    color: '#334155',
  },
  payButton: {
    backgroundColor: '#6366F1',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  payButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  secureText: {
    textAlign: 'center',
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 16,
  }
});
