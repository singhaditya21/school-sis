import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { config, requireBackendUrl } from '../config';

type RollCallStatus = 'PRESENT' | 'ABSENT' | 'LATE';

interface SectionOption {
  id: string;
  gradeName: string;
  sectionName: string;
  studentCount: number;
}

interface RosterStudent {
  studentId: string;
  name: string;
  rollNumber: number | null;
  admissionNumber: string;
  todayStatus: string | null;
}

interface QueuedBatch {
  id: string;
  sectionId: string;
  sectionLabel: string;
  date: string;
  entries: { studentId: string; status: RollCallStatus }[];
  queuedAt: string;
}

export function TeacherRollCallScreen() {
  const [sections, setSections] = useState<SectionOption[]>([]);
  const [selectedSection, setSelectedSection] = useState<SectionOption | null>(null);
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [draftStatuses, setDraftStatuses] = useState<Record<string, RollCallStatus>>({});
  const [offlineMode, setOfflineMode] = useState(false);
  const [offlineQueue, setOfflineQueue] = useState<QueuedBatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(config.BACKEND_CONFIG_ERROR);

  const loadRoster = useCallback(async (sectionId?: string) => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const base = requireBackendUrl();
      const query = sectionId ? `?sectionId=${encodeURIComponent(sectionId)}` : '';
      const res = await fetch(`${base}/api/mobile/workspace${query}`, {
        method: 'GET',
        credentials: 'include',
      });
      const json = (await res.json()) as {
        mode?: string;
        sections?: SectionOption[];
        selectedSection?: SectionOption | null;
        roster?: RosterStudent[];
        error?: string;
      };
      if (!res.ok) {
        setStatusMessage(json.error || 'Sign in on Parent Hub or LCNC Explorer first to load staff sections.');
        return;
      }
      if (json.mode !== 'STAFF') {
        setStatusMessage('Sign in with a Teacher or School Staff account to mark class registers.');
        return;
      }
      const nextSections = json.sections || [];
      const nextSelected = json.selectedSection || null;
      const nextRoster = json.roster || [];
      setSections(nextSections);
      setSelectedSection(nextSelected);
      setRoster(nextRoster);

      const initialDraft: Record<string, RollCallStatus> = {};
      for (const student of nextRoster) {
        const existing = student.todayStatus as RollCallStatus | null;
        initialDraft[student.studentId] =
          existing === 'ABSENT' || existing === 'LATE' ? existing : 'PRESENT';
      }
      setDraftStatuses(initialDraft);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Classroom offline — batches will queue locally.');
    } finally {
      setLoading(false);
    }
  }, []);

  const cycleStatus = useCallback((studentId: string) => {
    setDraftStatuses((prev) => {
      const current = prev[studentId] || 'PRESENT';
      const next: RollCallStatus =
        current === 'PRESENT' ? 'ABSENT' : current === 'ABSENT' ? 'LATE' : 'PRESENT';
      return { ...prev, [studentId]: next };
    });
  }, []);

  const markAllPresent = useCallback(() => {
    const updated: Record<string, RollCallStatus> = {};
    for (const s of roster) {
      updated[s.studentId] = 'PRESENT';
    }
    setDraftStatuses(updated);
  }, [roster]);

  const submitOrQueueBatch = useCallback(async () => {
    if (!selectedSection || roster.length === 0) return;
    const todayIso = new Date().toISOString().slice(0, 10);
    const entries = roster.map((s) => ({
      studentId: s.studentId,
      status: draftStatuses[s.studentId] || 'PRESENT',
    }));

    const enqueueLocally = (reason: string) => {
      const batch: QueuedBatch = {
        id: `${selectedSection.id}-${Date.now()}`,
        sectionId: selectedSection.id,
        sectionLabel: `${selectedSection.gradeName}-${selectedSection.sectionName}`,
        date: todayIso,
        entries,
        queuedAt: new Date().toLocaleTimeString(),
      };
      setOfflineQueue((prev) => [...prev, batch]);
      setStatusMessage(`${reason} Saved ${entries.length} marks in Offline Sync Queue.`);
    };

    if (offlineMode) {
      enqueueLocally('Offline Classroom Mode active.');
      return;
    }

    setLoading(true);
    try {
      const base = requireBackendUrl();
      const res = await fetch(`${base}/api/mobile/workspace`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'SYNC_ATTENDANCE',
          sectionId: selectedSection.id,
          date: todayIso,
          entries,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; savedCount?: number; error?: string };
      if (!res.ok || !json.ok) {
        setStatusMessage(json.error || 'Could not sync attendance register.');
        return;
      }
      setStatusMessage(`Synced ${json.savedCount ?? entries.length} student attendance marks to campus ledger.`);
    } catch {
      enqueueLocally('Wi-Fi unreachable.');
    } finally {
      setLoading(false);
    }
  }, [selectedSection, roster, draftStatuses, offlineMode]);

  const syncOfflineQueue = useCallback(async () => {
    if (offlineQueue.length === 0) return;
    setLoading(true);
    setStatusMessage(null);
    const remaining: QueuedBatch[] = [];
    let syncedBatches = 0;

    try {
      const base = requireBackendUrl();
      for (const batch of offlineQueue) {
        try {
          const res = await fetch(`${base}/api/mobile/workspace`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'SYNC_ATTENDANCE',
              sectionId: batch.sectionId,
              date: batch.date,
              entries: batch.entries,
            }),
          });
          if (res.ok) {
            syncedBatches += 1;
          } else {
            remaining.push(batch);
          }
        } catch {
          remaining.push(batch);
        }
      }
      setOfflineQueue(remaining);
      setStatusMessage(
        remaining.length === 0
          ? `All ${syncedBatches} queued classroom batch(es) synced cleanly.`
          : `Synced ${syncedBatches} batch(es); ${remaining.length} still awaiting connectivity.`,
      );
    } finally {
      setLoading(false);
    }
  }, [offlineQueue]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.heroCard}>
        <Text style={styles.eyebrow}>30-SECOND TEACHER HABIT LOOP</Text>
        <Text style={styles.heroTitle}>Offline-Resilient Roll Call</Text>
        <Text style={styles.heroSubtitle}>
          Tap any student to toggle Present / Absent / Late. Queues automatically in dead Wi-Fi zones and syncs in 1 tap.
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>Offline Classroom Queue</Text>
            <Text style={styles.mutedText}>
              {offlineQueue.length === 0
                ? 'Zero unsynced batches'
                : `${offlineQueue.length} batch(es) queued locally`}
            </Text>
          </View>
          <Switch value={offlineMode} onValueChange={setOfflineMode} />
        </View>

        <View style={styles.actionRow}>
          <Pressable onPress={() => loadRoster(selectedSection?.id)} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Load Today&apos;s Sections</Text>
          </Pressable>
          {offlineQueue.length > 0 ? (
            <Pressable onPress={syncOfflineQueue} style={styles.brassButton}>
              <Text style={styles.brassButtonText}>Sync {offlineQueue.length} Queued</Text>
            </Pressable>
          ) : null}
        </View>

        {statusMessage ? <Text style={styles.statusNote}>{statusMessage}</Text> : null}
      </View>

      {sections.length > 0 ? (
        <View style={styles.chipRow}>
          {sections.map((sec) => {
            const active = sec.id === selectedSection?.id;
            return (
              <Pressable
                key={sec.id}
                onPress={() => loadRoster(sec.id)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {sec.gradeName}-{sec.sectionName} ({sec.studentCount})
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {roster.length > 0 ? (
        <View style={styles.card}>
          <View style={styles.rosterHeader}>
            <Text style={styles.sectionTitle}>
              {selectedSection?.gradeName}-{selectedSection?.sectionName} Register
            </Text>
            <Pressable onPress={markAllPresent} style={styles.smallOutlineBtn}>
              <Text style={styles.smallOutlineText}>All Present</Text>
            </Pressable>
          </View>

          {roster.map((student) => {
            const st = draftStatuses[student.studentId] || 'PRESENT';
            return (
              <Pressable
                key={student.studentId}
                onPress={() => cycleStatus(student.studentId)}
                style={styles.studentRow}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.studentName}>
                    {student.rollNumber !== null ? `#${student.rollNumber} ` : ''}
                    {student.name}
                  </Text>
                  <Text style={styles.mutedText}>{student.admissionNumber}</Text>
                </View>
                <View
                  style={[
                    styles.statusPill,
                    st === 'PRESENT'
                      ? styles.pillPresent
                      : st === 'ABSENT'
                        ? styles.pillAbsent
                        : styles.pillLate,
                  ]}
                >
                  <Text style={styles.statusPillText}>{st}</Text>
                </View>
              </Pressable>
            );
          })}

          <Pressable onPress={submitOrQueueBatch} style={styles.primaryButton} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {offlineMode ? 'Save Register to Offline Queue' : 'Submit Register Now'}
              </Text>
            )}
          </Pressable>
        </View>
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
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#162B4D',
  },
  mutedText: {
    fontSize: 12,
    color: '#5B6472',
    marginTop: 2,
  },
  statusNote: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '600',
    color: '#162B4D',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D5CDBE',
  },
  chipActive: {
    backgroundColor: '#162B4D',
    borderColor: '#AF7627',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#162B4D',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  rosterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  smallOutlineBtn: {
    borderWidth: 1,
    borderColor: '#AF7627',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  smallOutlineText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#162B4D',
  },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#ECE6DA',
    gap: 10,
  },
  studentName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#162B4D',
  },
  statusPill: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 82,
    alignItems: 'center',
  },
  pillPresent: {
    backgroundColor: '#067647',
  },
  pillAbsent: {
    backgroundColor: '#B42318',
  },
  pillLate: {
    backgroundColor: '#AF7627',
  },
  statusPillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
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
    borderWidth: 1,
    borderColor: '#AF7627',
    backgroundColor: '#FAF8F4',
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: '#162B4D',
    fontWeight: '700',
    fontSize: 13,
  },
  brassButton: {
    backgroundColor: '#AF7627',
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  brassButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
});
