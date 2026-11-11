import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { config } from '../config';

/**
 * States accurately what the current mobile build supports and what remains
 * intentionally scoped to the web portal:
 *   - JSON token sign-in (`POST /api/auth/token`, with optional MFA code) and
 *     tenant-scoped LCNC metadata browsing/creation (`/api/data`) are live on
 *     the LCNC Data Explorer tab.
 *   - Parent fee payments and full student/family portal workflows remain on
 *     the web application until invoice-reconciled Stripe Connect checkout is
 *     configured per tenant.
 */

const CAPABILITY_NOTES = [
  {
    title: 'Mobile JSON Token Sign-In & MFA (/api/auth/token)',
    detail:
      'Authorized staff can authenticate on the LCNC Data Explorer tab with schoolCode, email, password, and optional 6-digit TOTP or backup MFA code, and clear their session token at any time via Sign Out.',
  },
  {
    title: 'Tenant-Scoped Metadata Explorer (/api/data)',
    detail:
      'Every object discovery, record read, and record creation call runs under verified tenant row-level security (RLS) and field-level security (FLS) rules.',
  },
  {
    title: 'Online Fee Payments Scoped to Web Portal',
    detail:
      'Mobile card collection remains disabled so charges cannot occur without invoice reconciliation. Families and finance staff should continue using the web portal until Stripe Connect and webhook secrets are configured in /settings/payments.',
  },
];

export function StatusScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>ScholarMind</Text>
        <Text style={styles.subtitle}>Mobile Companion · System Status</Text>

        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>
            LCNC Metadata Explorer Active · Payments Web-Only
          </Text>
          <Text style={styles.bannerBody}>
            Use the LCNC Data Explorer tab to sign in to your tenant workspace and
            inspect or create published custom object records. For parent fee
            payments, attendance, and academic report cards, continue using the
            ScholarMind web portal.
          </Text>
        </View>

        {config.BACKEND_CONFIG_ERROR && (
          <View style={styles.warningCard}>
            <Text style={styles.warningTitle}>Backend Configuration Required</Text>
            <Text style={styles.warningBody}>{config.BACKEND_CONFIG_ERROR}</Text>
          </View>
        )}

        <Text style={styles.sectionHeading}>Scope &amp; Security Controls</Text>
        {CAPABILITY_NOTES.map((item) => (
          <View key={item.title} style={styles.blocker}>
            <Text style={styles.blockerTitle}>{item.title}</Text>
            <Text style={styles.blockerDetail}>{item.detail}</Text>
          </View>
        ))}

        <Text style={styles.sectionHeading}>Build Configuration</Text>
        <View style={styles.configRow}>
          <Text style={styles.configLabel}>Backend Origin</Text>
          <Text style={styles.configValue} numberOfLines={2}>
            {config.BACKEND_URL ?? 'Unconfigured (HTTPS EXPO_PUBLIC_BACKEND_URL required)'}
          </Text>
          <Text style={[styles.configLabel, { marginTop: 12 }]}>Transport Policy</Text>
          <Text style={styles.configValue}>
            {config.IS_DEV
              ? 'Development build (HTTPS or local simulator/LAN dev host)'
              : 'Production build (HTTPS strictly enforced; cleartext HTTP refused)'}
          </Text>
        </View>
        <Text style={styles.footnote}>
          Shown for diagnostics. No network request is made from this screen.
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
    backgroundColor: '#ECFDF5',
    borderColor: '#6EE7B7',
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    marginTop: 24,
  },
  bannerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#065F46',
  },
  bannerBody: {
    fontSize: 14,
    lineHeight: 21,
    color: '#047857',
    marginTop: 8,
  },
  warningCard: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FCD34D',
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginTop: 14,
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#78350F',
  },
  warningBody: {
    fontSize: 13,
    lineHeight: 19,
    color: '#92400E',
    marginTop: 4,
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: '#94A3B8',
    marginTop: 28,
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
