import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ParentHubScreen } from './screens/ParentHubScreen';
import { TeacherRollCallScreen } from './screens/TeacherRollCallScreen';
import { MetadataExplorerScreen } from './screens/MetadataExplorerScreen';
import { StatusScreen } from './screens/StatusScreen';

/**
 * ScholarMind iOS & Android Companion App (Oxford Navy & Heritage Brass).
 *
 * Surfaces:
 * 1. Parent Hub: Sibling switcher, HMAC-signed /pay/[token] UPI checkout handoff,
 *    official receipt summary, attendance, leave note & Digital Dismissal Gate Pass QR.
 * 2. Teacher Ops: Offline-resilient 30-second roll-call attendance register with batch sync.
 * 3. LCNC Explorer: Dynamic Metadata Object Explorer (/api/data/[object_name]).
 * 4. Status: Backend connectivity & deployment diagnostics.
 */
export default function App() {
  const [activeTab, setActiveTab] = useState<'parent' | 'teacher' | 'explorer' | 'status'>('parent');

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.root}>
        <View style={styles.tabBar}>
          {(
            [
              { key: 'parent', label: 'Parent Hub' },
              { key: 'teacher', label: 'Teacher Ops' },
              { key: 'explorer', label: 'LCNC Data' },
              { key: 'status', label: 'Status' },
            ] as const
          ).map((tab) => {
            const active = activeTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={[styles.tab, active && styles.tabActive]}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.body}>
          {activeTab === 'parent' && <ParentHubScreen />}
          {activeTab === 'teacher' && <TeacherRollCallScreen />}
          {activeTab === 'explorer' && <MetadataExplorerScreen />}
          {activeTab === 'status' && <StatusScreen />}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FAF8F4',
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E6E0D4',
    gap: 6,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 9,
    alignItems: 'center',
    backgroundColor: '#F5EFE2',
    borderWidth: 1,
    borderColor: '#E6E0D4',
  },
  tabActive: {
    backgroundColor: '#162B4D',
    borderColor: '#AF7627',
  },
  tabText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#162B4D',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  body: {
    flex: 1,
  },
});
