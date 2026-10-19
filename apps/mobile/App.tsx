import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusScreen } from './screens/StatusScreen';
import { MetadataExplorerScreen } from './screens/MetadataExplorerScreen';

/**
 * Mobile shell with two honest surfaces:
 * 1. Dynamic Metadata Object Explorer (/api/data/[object_name]) for LCNC objects & fields.
 * 2. Portal Status & Diagnostics screen.
 *
 * Do not reintroduce a payment screen here until the backend can reconcile the
 * charge to an invoice (see the notes in StatusScreen).
 */
export default function App() {
  const [activeTab, setActiveTab] = useState<'explorer' | 'status'>('explorer');

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.root}>
        <View style={styles.tabBar}>
          <Pressable
            onPress={() => setActiveTab('explorer')}
            style={[styles.tab, activeTab === 'explorer' && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeTab === 'explorer' && styles.tabTextActive]}>
              LCNC Data Explorer
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab('status')}
            style={[styles.tab, activeTab === 'status' && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeTab === 'status' && styles.tabTextActive]}>
              System Status
            </Text>
          </Pressable>
        </View>
        <View style={styles.body}>
          {activeTab === 'explorer' ? <MetadataExplorerScreen /> : <StatusScreen />}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
  },
  tabActive: {
    backgroundColor: '#0E8074',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  body: {
    flex: 1,
  },
});
