import React from 'react';
import { View, Text, Button, StyleSheet, SafeAreaView } from 'react-native';

export function LoginScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>School SIS</Text>
        <Text style={styles.subtitle}>Development preview — authentication disabled</Text>
        
        <View style={styles.buttonContainer}>
          <Button 
            title="Mobile login not configured" 
            disabled
            onPress={() => undefined} 
          />
          <Text style={styles.notice}>
            This client is not available for production use. Use the authenticated web portal
            until token login, secure storage, and mobile security tests are complete.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
    marginBottom: 48,
  },
  buttonContainer: {
    width: '100%',
    maxWidth: 300,
  },
  notice: {
    color: '#666',
    fontSize: 13,
    marginTop: 16,
    textAlign: 'center',
  }
});
