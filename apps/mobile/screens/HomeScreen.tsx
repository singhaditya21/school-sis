import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';

export function HomeScreen() {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.greeting}>Good morning, Sarah!</Text>
      </View>
      
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Attendance</Text>
        <Text style={styles.cardContent}>Alex checked in at 8:14 AM via Front Gate.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Upcoming Fees</Text>
        <Text style={styles.cardContent}>Transport Fee - $50.00 due next Friday.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 16,
  },
  header: {
    marginBottom: 24,
  },
  greeting: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  card: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  cardContent: {
    fontSize: 16,
    color: '#444',
  }
});
