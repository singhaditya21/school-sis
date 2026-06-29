import React from 'react';
import { View, Text, Button, StyleSheet, SafeAreaView } from 'react-native';

export function LoginScreen({ navigation }: any) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>School SIS</Text>
        <Text style={styles.subtitle}>Parent Portal</Text>
        
        <View style={styles.buttonContainer}>
          <Button 
            title="Login securely" 
            onPress={() => navigation.navigate('Home')} 
          />
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
  }
});
