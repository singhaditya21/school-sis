import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StripeProvider } from '@stripe/stripe-react-native';
import { HomeScreen } from './screens/HomeScreen';
import { LoginScreen } from './screens/LoginScreen';
import { TuitionPaymentScreen } from './screens/TuitionPaymentScreen';
import { NotificationCenterScreen } from './screens/NotificationCenterScreen';
import { config } from './config';

const Stack = createNativeStackNavigator();

export default function App() {
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
