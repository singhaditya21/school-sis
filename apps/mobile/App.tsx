import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StripeProvider } from '@stripe/stripe-react-native';
import { ScholarMindThemeProvider, Screen, UnavailableState } from '@school-sis/ui-native';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { HomeScreen } from './screens/HomeScreen';
import { LoginScreen } from './screens/LoginScreen';
import { TuitionPaymentScreen } from './screens/TuitionPaymentScreen';
import { NotificationCenterScreen } from './screens/NotificationCenterScreen';
import { config } from './config';

const Stack = createNativeStackNavigator();
const internalPreviewEnabled =
  __DEV__ && process.env.EXPO_PUBLIC_MOBILE_INTERNAL_PREVIEW === 'true';

function PrototypeNavigator() {
  return (
    <StripeProvider publishableKey={config.STRIPE_PUBLISHABLE_KEY}>
      <NavigationContainer>
        <Stack.Navigator initialRouteName="Login">
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Home"
            component={HomeScreen}
            options={{ title: 'Parent Portal', headerBackVisible: false }}
          />
          <Stack.Screen
            name="Payment"
            component={TuitionPaymentScreen}
            options={{ title: 'Pay Tuition' }}
          />
          <Stack.Screen
            name="Notifications"
            component={NotificationCenterScreen}
            options={{ title: 'Live Activity' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </StripeProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <ScholarMindThemeProvider>
        {internalPreviewEnabled ? (
          <PrototypeNavigator />
        ) : (
          <Screen contentContainerStyle={{ justifyContent: 'center' }}>
            <UnavailableState
              title="ScholarMind mobile is not available yet"
              description="Use the secure web portal while mobile authentication and payments complete pilot validation."
            />
          </Screen>
        )}
      </ScholarMindThemeProvider>
    </SafeAreaProvider>
  );
}
