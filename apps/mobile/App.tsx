import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StripeProvider } from '@stripe/stripe-react-native';
import { HomeScreen } from './screens/HomeScreen';
import { LoginScreen } from './screens/LoginScreen';
import { TuitionPaymentScreen } from './screens/TuitionPaymentScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    // In production, publishableKey is fetched from environment variables
    <StripeProvider publishableKey="pk_live_mock_publishable_key">
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
        </Stack.Navigator>
      </NavigationContainer>
    </StripeProvider>
  );
}
