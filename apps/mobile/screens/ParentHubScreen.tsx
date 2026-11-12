import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { config, requireBackendUrl, resolveSafeBackendUrl } from '../config';
import {
  buildMobileRequestInit,
  extractBearerToken,
  getMobileSession,
  setMobileSession,
  subscribeMobileSession,
} from '../lib/secure-session';

interface ParentChildSummary {
  id: string;
  name: string;
  gradeName: string;
  sectionName: string;
  admissionNumber: string;
}

interface PendingInvoiceItem {
  id: string;
  invoiceNumber: string;
  description: string | null;
  balance: number;
  dueDate: string | null;
  status: string;
  payPath: string;
}

interface ParentWorkspaceResponse {
  mode: 'PARENT' | 'STAFF' | 'STUDENT';
  children?: ParentChildSummary[];
  selectedChild?: ParentChildSummary | null;
  fees?: {
    outstanding: number;
    pendingInvoices: PendingInvoiceItem[];
  };
  latestReceipt?: {
    receiptNumber: string;
    amount: number;
    paidAt: string | null;
  } | null;
  attendance?: {
    present: number;
    absent: number;
    late: number;
    marked: number;
    rate: number | null;
  };
  homework?: {
    id: string;
    title: string;
    dueDate: string | null;
    subjectName: string;
  }[];
  transport?: {
    routeName: string;
    vehicleNumber: string;
    stopName: string | null;
    pickupTime: string | null;
    dropTime: string | null;
    driverName: string | null;
    driverPhone: string | null;
  } | null;
  gatePass?: {
    token: string;
    deskCode: string;
    validDate: string;
    verifyPath: string;
    matrix: boolean[][];
  };
}

export function ParentHubScreen() {
  const initialSession = getMobileSession();
  const [schoolCode, setSchoolCode] = useState(initialSession.schoolCode || 'DEMO-CAMPUS');
  const [email, setEmail] = useState(initialSession.email || '');
  const [password, setPassword] = useState('');
  const [signedInEmail, setSignedInEmail] = useState<string | null>(initialSession.email);
  const [workspace, setWorkspace] = useState<ParentWorkspaceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(config.BACKEND_CONFIG_ERROR);
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveFeedback, setLeaveFeedback] = useState<string | null>(null);

  useEffect(() => {
    return subscribeMobileSession((next) => {
      setSignedInEmail(next.email);
      if (next.schoolCode) setSchoolCode(next.schoolCode);
    });
  }, []);

  const loadWorkspace = useCallback(async (childId?: string, tokenOverride?: string | null) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const base = requireBackendUrl();
      const query = childId ? `?childId=${encodeURIComponent(childId)}` : '';
      const res = await fetch(
        `${base}/api/mobile/workspace${query}`,
        buildMobileRequestInit({ method: 'GET' }, tokenOverride),
      );
      const json = (await res.json()) as ParentWorkspaceResponse & { error?: string };
      if (!res.ok) {
        setErrorMessage(json.error || `Failed to load workspace (HTTP ${res.status}).`);
        return;
      }
      setWorkspace(json);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Network error loading parent hub.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSignIn = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const base = requireBackendUrl();
      const normalizedSchoolCode = schoolCode.trim().toUpperCase();
      const normalizedEmail = email.trim().toLowerCase();
      const res = await fetch(
        `${base}/api/auth/token`,
        buildMobileRequestInit(
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              schoolCode: normalizedSchoolCode,
              email: normalizedEmail,
              password,
            }),
          },
          null,
        ),
      );
      const json = (await res.json()) as Record<string, unknown> & { email?: string; error?: string };
      if (!res.ok) {
        setErrorMessage(json.error || 'Unable to sign in. Verify school code and credentials.');
        setLoading(false);
        return;
      }
      const issuedToken = extractBearerToken(json);
      const resolvedEmail = typeof json.email === 'string' && json.email ? json.email : normalizedEmail;
      setMobileSession({
        bearerToken: issuedToken,
        email: resolvedEmail,
        schoolCode: normalizedSchoolCode,
        authenticated: true,
      });
      setSignedInEmail(resolvedEmail);
      setPassword('');
      await loadWorkspace(undefined, issuedToken);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to reach ScholarMind server.');
      setLoading(false);
    }
  }, [schoolCode, email, password, loadWorkspace]);

  const handleOpenPayLink = useCallback(async (payPath: string) => {
    try {
      const safeTargetUrl = resolveSafeBackendUrl(payPath);
      await Linking.openURL(safeTargetUrl);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not launch payment link.');
    }
  }, []);

  const handleSubmitLeaveNote = useCallback(async () => {
    if (!workspace?.selectedChild || leaveReason.trim().length < 3) {
      setLeaveFeedback('Enter a brief reason (min 3 characters).');
      return;
    }
    setLeaveFeedback(null);
    try {
      const base = requireBackendUrl();
      const todayIso = new Date().toISOString().slice(0, 10);
      const res = await fetch(
        `${base}/api/mobile/workspace`,
        buildMobileRequestInit({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'SUBMIT_PARENT_LEAVE_NOTE',
            studentId: workspace.selectedChild.id,
            leaveDate: todayIso,
            reason: leaveReason.trim(),
          }),
        }),
      );
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setLeaveFeedback(json.error || 'Could not submit leave note.');
        return;
      }
      setLeaveReason('');
      setLeaveFeedback('Leave note logged with school office.');
    } catch (err) {
      setLeaveFeedback(err instanceof Error ? err.message : 'Network error submitting leave note.');
    }
  }, [workspace, leaveReason]);

  const child = workspace?.selectedChild;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.heroCard}>
        <Text style={styles.eyebrow}>SCHOLARMIND GUARDIAN COMPANION</Text>
        <Text style={styles.heroTitle}>Parent Habit Loop</Text>
        <Text style={styles.heroSubtitle}>
          Sibling switcher, 2-tap verified UPI fee checkout, attendance, transport ETA &amp; cryptographic dismissal pass.
        </Text>
      </View>

      {errorMessage ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}

      {!signedInEmail && !workspace ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Guardian Sign-In</Text>
          <Text style={styles.label}>Campus Code</Text>
          <TextInput
            value={schoolCode}
            onChangeText={setSchoolCode}
            autoCapitalize="characters"
            placeholder="DEMO-CAMPUS"
            style={styles.input}
          />
          <Text style={styles.label}>Registered Guardian Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="guardian@example.org"
            style={styles.input}
          />
          <Text style={styles.label}>Password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••••"
            style={styles.input}
          />
          <Pressable onPress={handleSignIn} style={styles.primaryButton} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Sign In to Parent Hub</Text>
            )}
          </Pressable>
          <Pressable onPress={() => loadWorkspace()} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Refresh Active Session</Text>
          </Pressable>
        </View>
      ) : null}

      {workspace && workspace.mode !== 'PARENT' ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Signed in as Staff ({workspace.mode})</Text>
          <Text style={styles.mutedText}>
            Switch to the Teacher Ops tab above to mark 30-second offline-resilient attendance.
          </Text>
        </View>
      ) : null}

      {workspace?.mode === 'PARENT' && workspace.children && workspace.children.length > 0 ? (
        <>
          {/* Sibling Switcher */}
          <View style={styles.siblingRow}>
            {workspace.children.map((item) => {
              const selected = item.id === child?.id;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => loadWorkspace(item.id)}
                  style={[styles.siblingChip, selected && styles.siblingChipSelected]}
                >
                  <Text style={[styles.siblingChipText, selected && styles.siblingChipTextSelected]}>
                    {item.name} · {item.gradeName}-{item.sectionName}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* 2-Tap Verified UPI Fee Card */}
          <View style={styles.card}>
            <Text style={styles.eyebrowBrass}>FEES &amp; VERIFIED RECEIPTS</Text>
            <Text style={styles.metricValue}>
              INR {(workspace.fees?.outstanding ?? 0).toLocaleString('en-IN')}
            </Text>
            <Text style={styles.mutedText}>
              {workspace.fees && workspace.fees.outstanding > 0
                ? `${workspace.fees.pendingInvoices.length} payable invoice(s) — reconciled directly to school ledger`
                : 'All billed installments settled'}
            </Text>

            {workspace.fees?.pendingInvoices.map((inv) => (
              <View key={inv.id} style={styles.invoiceRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.invoiceTitle}>{inv.invoiceNumber}</Text>
                  <Text style={styles.mutedText}>
                    INR {inv.balance.toLocaleString('en-IN')}
                    {inv.dueDate ? ` · Due ${inv.dueDate}` : ''}
                  </Text>
                </View>
                <Pressable
                  onPress={() => handleOpenPayLink(inv.payPath)}
                  style={styles.brassButton}
                >
                  <Text style={styles.brassButtonText}>Pay via UPI</Text>
                </Pressable>
              </View>
            ))}

            {workspace.latestReceipt ? (
              <View style={styles.receiptPill}>
                <Text style={styles.receiptText}>
                  Latest Official Receipt: {workspace.latestReceipt.receiptNumber} · INR{' '}
                  {workspace.latestReceipt.amount.toLocaleString('en-IN')}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Digital Dismissal Gate Pass QR */}
          {workspace.gatePass ? (
            <View style={styles.gatePassCard}>
              <Text style={styles.eyebrowBrass}>DIGITAL DISMISSAL GATE PASS</Text>
              <Text style={styles.sectionTitle}>Desk Code: {workspace.gatePass.deskCode}</Text>
              <Text style={styles.mutedText}>
                Valid {workspace.gatePass.validDate} for {child?.name}
              </Text>
              <View style={styles.qrBox}>
                {workspace.gatePass.matrix.map((row, rIdx) => (
                  <View key={rIdx} style={styles.qrRow}>
                    {row.map((cell, cIdx) => (
                      <View
                        key={cIdx}
                        style={[styles.qrCell, cell ? styles.qrCellDark : styles.qrCellLight]}
                      />
                    ))}
                  </View>
                ))}
              </View>
              <Pressable
                onPress={() => handleOpenPayLink(workspace.gatePass!.verifyPath)}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Open Signed Verification Certificate</Text>
              </Pressable>
            </View>
          ) : null}

          {/* Attendance & Leave Note */}
          <View style={styles.card}>
            <Text style={styles.eyebrowBrass}>MONTHLY ATTENDANCE &amp; LEAVE</Text>
            <Text style={styles.metricValue}>
              {workspace.attendance?.rate !== null && workspace.attendance?.rate !== undefined
                ? `${workspace.attendance.rate}%`
                : 'Not Marked'}
            </Text>
            <Text style={styles.mutedText}>
              {workspace.attendance?.present ?? 0} Present · {workspace.attendance?.late ?? 0} Late ·{' '}
              {workspace.attendance?.absent ?? 0} Absent
            </Text>

            <Text style={[styles.label, { marginTop: 12 }]}>Quick Absence / Leave Note</Text>
            <TextInput
              value={leaveReason}
              onChangeText={setLeaveReason}
              placeholder="e.g. Pediatrician appointment morning session"
              style={styles.input}
            />
            <Pressable onPress={handleSubmitLeaveNote} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Send Leave Note to Class Register</Text>
            </Pressable>
            {leaveFeedback ? <Text style={styles.feedbackText}>{leaveFeedback}</Text> : null}
          </View>

          {/* Transport Corridor & Homework */}
          <View style={styles.card}>
            <Text style={styles.eyebrowBrass}>TRANSPORT CORRIDOR</Text>
            {workspace.transport ? (
              <>
                <Text style={styles.sectionTitle}>{workspace.transport.routeName}</Text>
                <Text style={styles.mutedText}>
                  Coach {workspace.transport.vehicleNumber}
                  {workspace.transport.stopName ? ` · Stop: ${workspace.transport.stopName}` : ''}
                </Text>
                <Text style={styles.mutedText}>
                  Pickup {workspace.transport.pickupTime || '—'} · Drop{' '}
                  {workspace.transport.dropTime || '—'}
                </Text>
              </>
            ) : (
              <Text style={styles.mutedText}>Direct guardian drop-off &amp; dismissal</Text>
            )}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FAF8F4',
  },
  content: {
    padding: 16,
    gap: 14,
    paddingBottom: 36,
  },
  heroCard: {
    backgroundColor: '#162B4D',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#AF7627',
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    color: '#E5C185',
    marginBottom: 4,
  },
  eyebrowBrass: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.3,
    color: '#AF7627',
    marginBottom: 4,
  },
  heroTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  heroSubtitle: {
    fontSize: 13,
    color: '#E2E8F0',
    marginTop: 6,
    lineHeight: 19,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E6E0D4',
  },
  gatePassCard: {
    backgroundColor: '#F5EFE2',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#AF7627',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#162B4D',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 26,
    fontWeight: '800',
    color: '#162B4D',
    marginVertical: 2,
  },
  mutedText: {
    fontSize: 13,
    color: '#5B6472',
    lineHeight: 18,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#162B4D',
    marginTop: 8,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D5CDBE',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: '#FAF8F4',
    color: '#162B4D',
  },
  primaryButton: {
    marginTop: 14,
    backgroundColor: '#162B4D',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  secondaryButton: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#AF7627',
    backgroundColor: '#FAF8F4',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#162B4D',
    fontWeight: '700',
    fontSize: 13,
  },
  brassButton: {
    backgroundColor: '#AF7627',
    borderRadius: 9,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  brassButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  siblingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  siblingChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D5CDBE',
  },
  siblingChipSelected: {
    backgroundColor: '#162B4D',
    borderColor: '#AF7627',
  },
  siblingChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#162B4D',
  },
  siblingChipTextSelected: {
    color: '#FFFFFF',
  },
  invoiceRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#ECE6DA',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  invoiceTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#162B4D',
  },
  receiptPill: {
    marginTop: 12,
    backgroundColor: '#ECFDF3',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#ABEFC6',
  },
  receiptText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#067647',
  },
  qrBox: {
    marginVertical: 12,
    padding: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#AF7627',
  },
  qrRow: {
    flexDirection: 'row',
  },
  qrCell: {
    width: 6,
    height: 6,
  },
  qrCellDark: {
    backgroundColor: '#162B4D',
  },
  qrCellLight: {
    backgroundColor: '#FFFFFF',
  },
  errorBanner: {
    backgroundColor: '#FEF3F2',
    borderColor: '#FECDCA',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  errorText: {
    color: '#B42318',
    fontSize: 13,
    fontWeight: '600',
  },
  feedbackText: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
    color: '#162B4D',
  },
});
