import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { config } from '../config';

/**
 * The mobile app has no working sign-in, so it cannot read any tenant-scoped
 * data and must not offer a payment path. Rather than showing placeholder
 * content, this screen states plainly what the build can and cannot do.
 */

const BLOCKERS = [
  {
    title: 'Mobile JSON Sign-In Ready (/api/auth/token)',
    detail:
      'Mobile clients can now establish a session via POST /api/auth/token with schoolCode, email, and password, and browse published custom objects via /api/data.',
  },
  {
    title: 'Tenant-scoped RBAC & RLS enforced',
    detail:
      'Every endpoint is gated on a verified session and scoped to the signed-in tenant and role.',
  },
  {
    title: 'Payments gated until Stripe Connect is configured',
    detail:
      'The previous payment screen could charge a card through Stripe without invoice reconciliation. Online payments remain on the web portal until Stripe Connect and webhook secrets are configured in /settings/payments.',
  },
];

export function StatusScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>ScholarMind</Text>
        <Text style={styles.subtitle}>Parent Portal</Text>

        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>Not available on mobile yet</Text>
          <Text style={styles.bannerBody}>
            This build cannot sign in, so it cannot show your child&apos;s
            information or accept a payment. Please use the web portal for fees,
            attendance and results.
          </Text>
        </View>

        <Text style={styles.sectionHeading}>Why</Text>
        {BLOCKERS.map((blocker) => (
          <View key={blocker.title} style={styles.blocker}>
            <Text style={styles.blockerTitle}>{blocker.title}</Text>
            <Text style={styles.blockerDetail}>{blocker.detail}</Text>
          </View>
        ))}

        <Text style={styles.sectionHeading}>Build configuration</Text>
        <View style={styles.configRow}>
          <Text style={styles.configLabel}>Backend</Text>
          <Text style={styles.configValue} numberOfLines={1}>
            {config.BACKEND_URL}
          </Text>
        </View>
        <Text style={styles.footnote}>
          Shown for diagnostics. No request is made to it from this screen.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 24,
    paddingBottom: 48,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 16,
    color: '#64748B',
    marginTop: 2,
  },
  banner: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FCD34D',
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    marginTop: 28,
  },
  bannerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#78350F',
  },
  bannerBody: {
    fontSize: 14,
    lineHeight: 21,
    color: '#92400E',
    marginTop: 8,
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: '#94A3B8',
    marginTop: 32,
    marginBottom: 12,
  },
  blocker: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 12,
  },
  blockerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
  },
  blockerDetail: {
    fontSize: 13,
    lineHeight: 20,
    color: '#475569',
    marginTop: 6,
  },
  configRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
  },
  configLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  configValue: {
    fontSize: 14,
    color: '#334155',
    marginTop: 4,
  },
  footnote: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 10,
  },
});
