/**
 * @module screens/MetadataExplorerScreen
 *
 * Mobile Dynamic Object Explorer for the ScholarMind LCNC Platform.
 *
 * Responsibilities:
 *   1. Native Session Sign-In & Sign-Out: Authenticates via `POST /api/auth/token`
 *      (`schoolCode`, `email`, `password`, optional `mfaCode`) and supports explicit
 *      bearer/session clearing on sign-out.
 *   2. Object Discovery: Fetches published tenant & standard objects via `GET /api/data`.
 *   3. Dynamic Record List & Creation: Fetches FLS-filtered fields and records (including evaluated
 *      `FORMULA` fields) via `GET /api/data/[object_name]` and submits new records via `POST /api/data/[object_name]`.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { config, requireBackendUrl } from '../config';

export interface MobileMetadataObject {
  id: string;
  name: string;
  apiName: string;
  isCustom: boolean;
}

export interface MobileMetadataField {
  id: string;
  label: string;
  apiName: string;
  dataType:
    | 'TEXT'
    | 'NUMBER'
    | 'BOOLEAN'
    | 'DATE'
    | 'PICKLIST'
    | 'CURRENCY'
    | 'LOOKUP'
    | 'FORMULA';
  isRequired?: boolean;
  picklistOptions?: string[] | null;
  validationRules?: {
    targetObject?: string;
    formula?: string;
  } | null;
}

type DraftFieldValue = string | boolean;

function authHeaders(token: string | null, extraHeaders?: Record<string, string>): Record<string, string> {
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extraHeaders,
  };
}

export function MetadataExplorerScreen() {
  const [objects, setObjects] = useState<MobileMetadataObject[]>([]);
  const [selectedObject, setSelectedObject] = useState<string>('');
  const [fields, setFields] = useState<MobileMetadataField[]>([]);
  const [records, setRecords] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    config.BACKEND_CONFIG_ERROR,
  );
  const [showCreateForm, setShowCreateForm] = useState<boolean>(false);
  const [draftValues, setDraftValues] = useState<Record<string, DraftFieldValue>>({});
  const [schoolCode, setSchoolCode] = useState<string>('GWD');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [mfaCode, setMfaCode] = useState<string>('');
  const [bearerToken, setBearerToken] = useState<string | null>(null);
  const [signedInUser, setSignedInUser] = useState<string | null>(null);

  const selectedObjectRef = useRef<string>('');
  selectedObjectRef.current = selectedObject;

  const isAuthenticated = Boolean(signedInUser || bearerToken || objects.length > 0);

  const loadObjects = useCallback(
    async (tokenOverride?: string | null) => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const backendUrl = requireBackendUrl();
        const activeToken = tokenOverride !== undefined ? tokenOverride : bearerToken;
        const res = await fetch(`${backendUrl}/api/data`, {
          headers: authHeaders(activeToken),
          credentials: 'include',
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setErrorMessage(
            body.error ||
              `HTTP ${res.status}: Sign in to browse tenant metadata objects.`,
          );
          return;
        }
        const payload = (await res.json()) as { objects?: MobileMetadataObject[] };
        const list = payload.objects || [];
        setObjects(list);
        if (list.length > 0 && !selectedObjectRef.current) {
          setSelectedObject(list[0].apiName);
        }
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : 'Unable to reach ScholarMind backend.',
        );
      } finally {
        setLoading(false);
      }
    },
    [bearerToken],
  );

  const loadObjectData = useCallback(
    async (objectApiName: string, tokenOverride?: string | null) => {
      if (!objectApiName) return;
      setLoading(true);
      setErrorMessage(null);
      try {
        const backendUrl = requireBackendUrl();
        const activeToken = tokenOverride !== undefined ? tokenOverride : bearerToken;
        const res = await fetch(
          `${backendUrl}/api/data/${encodeURIComponent(objectApiName)}`,
          {
            headers: authHeaders(activeToken),
            credentials: 'include',
          },
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setErrorMessage(body.error || `Failed to load object '${objectApiName}'`);
          return;
        }
        const payload = (await res.json()) as {
          data?: Record<string, unknown>[];
          fields?: MobileMetadataField[];
        };
        setRecords(payload.data || []);
        setFields(payload.fields || []);
        setDraftValues({});
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : 'Could not fetch object records.',
        );
      } finally {
        setLoading(false);
      }
    },
    [bearerToken],
  );

  useEffect(() => {
    if (config.BACKEND_URL) {
      void loadObjects();
    }
    // Intentionally run initial probe once on mount when a valid backend URL exists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedObject) {
      void loadObjectData(selectedObject);
    }
  }, [selectedObject, loadObjectData]);

  const handleMobileLogin = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const backendUrl = requireBackendUrl();
      const trimmedMfa = mfaCode.trim();
      const requestBody: Record<string, string> = {
        schoolCode: schoolCode.trim(),
        email: email.trim(),
        password,
      };
      if (trimmedMfa.length > 0) {
        requestBody.mfaCode = trimmedMfa;
      }

      const res = await fetch(`${backendUrl}/api/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(requestBody),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMessage(body.error || 'Sign-in failed.');
        return;
      }

      const issuedToken =
        typeof body.token === 'string' && body.token.length > 0
          ? body.token
          : typeof body.accessToken === 'string' && body.accessToken.length > 0
            ? body.accessToken
            : null;

      setBearerToken(issuedToken);
      setPassword('');
      setMfaCode('');
      setSignedInUser(
        body.user?.displayName ||
          body.displayName ||
          body.user?.email ||
          body.email ||
          email.trim(),
      );
      await loadObjects(issuedToken);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Network error during sign-in.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    const tokenToRevoke = bearerToken;
    setBearerToken(null);
    setSignedInUser(null);
    setObjects([]);
    setSelectedObject('');
    setFields([]);
    setRecords([]);
    setDraftValues({});
    setShowCreateForm(false);
    setPassword('');
    setMfaCode('');
    setErrorMessage(config.BACKEND_CONFIG_ERROR);

    if (config.BACKEND_URL) {
      await fetch(`${config.BACKEND_URL}/api/auth/logout`, {
        method: 'POST',
        headers: authHeaders(tokenToRevoke),
        credentials: 'include',
      }).catch(() => {});
    }
  };

  const handleCreateRecord = async () => {
    if (!selectedObject) return;
    setErrorMessage(null);

    const serializedPayload: Record<string, unknown> = {};
    for (const field of fields) {
      if (field.dataType === 'FORMULA') continue;

      if (field.dataType === 'BOOLEAN') {
        serializedPayload[field.apiName] = Boolean(draftValues[field.apiName]);
        continue;
      }

      const rawValue = String(draftValues[field.apiName] ?? '');
      const trimmed = rawValue.trim();

      if (field.dataType === 'NUMBER' || field.dataType === 'CURRENCY') {
        if (trimmed === '') {
          if (field.isRequired) {
            setErrorMessage(`"${field.label}" is required.`);
            return;
          }
          continue;
        }
        const parsedNumber = Number(trimmed);
        if (!Number.isFinite(parsedNumber)) {
          setErrorMessage(`"${field.label}" must be a valid number.`);
          return;
        }
        serializedPayload[field.apiName] = parsedNumber;
        continue;
      }

      if (trimmed === '') {
        if (field.isRequired) {
          setErrorMessage(`"${field.label}" is required.`);
          return;
        }
        continue;
      }

      serializedPayload[field.apiName] = rawValue;
    }

    setLoading(true);
    try {
      const backendUrl = requireBackendUrl();
      const res = await fetch(
        `${backendUrl}/api/data/${encodeURIComponent(selectedObject)}`,
        {
          method: 'POST',
          headers: authHeaders(bearerToken, { 'Content-Type': 'application/json' }),
          credentials: 'include',
          body: JSON.stringify(serializedPayload),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMessage(body.error || 'Could not create record.');
        return;
      }
      setShowCreateForm(false);
      setDraftValues({});
      await loadObjectData(selectedObject);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Network error.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerTextWrap}>
          <Text style={styles.title}>Dynamic Object Explorer</Text>
          <Text style={styles.subtitle}>
            Renders tenant-defined objects &amp; custom fields from /api/data
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.refreshBtn} onPress={() => void loadObjects()}>
            <Text style={styles.refreshBtnText}>Refresh</Text>
          </Pressable>
          {isAuthenticated && (
            <Pressable style={styles.signOutBtn} onPress={() => void handleSignOut()}>
              <Text style={styles.signOutBtnText}>Sign Out</Text>
            </Pressable>
          )}
        </View>
      </View>

      {isAuthenticated && (
        <View style={styles.sessionBar}>
          <Text style={styles.sessionText} numberOfLines={1}>
            Signed in{signedInUser ? ` as ${signedInUser}` : ''} ({schoolCode.trim() || 'Tenant'})
          </Text>
        </View>
      )}

      {errorMessage && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorTitle}>Connection / Session Notice</Text>
          <Text style={styles.errorBody}>{errorMessage}</Text>
        </View>
      )}

      {!isAuthenticated && (
        <View style={styles.formCard}>
          <Text style={styles.formHeading}>Sign In to Tenant Workspace</Text>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>School Code</Text>
            <TextInput
              style={styles.input}
              value={schoolCode}
              onChangeText={setSchoolCode}
              placeholder="e.g. GWD"
              autoCapitalize="characters"
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="admin@greenwood.edu"
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              secureTextEntry
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>
              MFA Code (Optional — 6-digit TOTP or backup code)
            </Text>
            <TextInput
              style={styles.input}
              value={mfaCode}
              onChangeText={setMfaCode}
              placeholder="e.g. 123456"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <Pressable style={styles.submitBtn} onPress={() => void handleMobileLogin()}>
            <Text style={styles.submitBtnText}>Sign In &amp; Load Objects</Text>
          </Pressable>
        </View>
      )}

      {/* Object Selector Pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.objectPillsScroll}
      >
        {objects.map((obj) => {
          const active = obj.apiName === selectedObject;
          return (
            <Pressable
              key={obj.id}
              onPress={() => setSelectedObject(obj.apiName)}
              style={[styles.objectPill, active && styles.objectPillActive]}
            >
              <Text
                style={[
                  styles.objectPillText,
                  active && styles.objectPillTextActive,
                ]}
              >
                {obj.name} {obj.isCustom ? '✦' : ''}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading && <ActivityIndicator size="small" color="#0E8074" style={{ marginVertical: 12 }} />}

      {selectedObject ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {selectedObject} ({records.length} records · {fields.length} fields)
            </Text>
            <Pressable
              style={styles.newRecordBtn}
              onPress={() => setShowCreateForm((v) => !v)}
            >
              <Text style={styles.newRecordBtnText}>
                {showCreateForm ? 'Cancel' : '+ New Record'}
              </Text>
            </Pressable>
          </View>

          {showCreateForm && (
            <View style={styles.formCard}>
              <Text style={styles.formHeading}>Create {selectedObject} Record</Text>
              {fields.map((field) => {
                if (field.dataType === 'FORMULA') {
                  return (
                    <View key={field.id} style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>
                        {field.label} (Calculated Formula)
                      </Text>
                      <Text style={styles.formulaNote}>
                        Auto-computed: {field.validationRules?.formula || '—'}
                      </Text>
                    </View>
                  );
                }

                if (field.dataType === 'BOOLEAN') {
                  return (
                    <View key={field.id} style={styles.booleanFieldGroup}>
                      <Text style={styles.fieldLabel}>{field.label}</Text>
                      <Switch
                        value={Boolean(draftValues[field.apiName])}
                        onValueChange={(val) =>
                          setDraftValues((prev) => ({ ...prev, [field.apiName]: val }))
                        }
                      />
                    </View>
                  );
                }

                const isNumericField =
                  field.dataType === 'NUMBER' || field.dataType === 'CURRENCY';

                return (
                  <View key={field.id} style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>
                      {field.label} {field.isRequired ? '*' : ''} ({field.dataType})
                    </Text>
                    <TextInput
                      style={styles.input}
                      placeholder={
                        field.dataType === 'LOOKUP'
                          ? `Target ${field.validationRules?.targetObject || 'record'} UUID`
                          : field.dataType === 'DATE'
                            ? 'YYYY-MM-DD'
                            : isNumericField
                              ? 'e.g. 12.50'
                              : `Enter ${field.label}`
                      }
                      keyboardType={isNumericField ? 'decimal-pad' : 'default'}
                      value={String(draftValues[field.apiName] ?? '')}
                      onChangeText={(txt) =>
                        setDraftValues((prev) => ({
                          ...prev,
                          [field.apiName]: txt,
                        }))
                      }
                    />
                  </View>
                );
              })}

              <Pressable style={styles.submitBtn} onPress={() => void handleCreateRecord()}>
                <Text style={styles.submitBtnText}>Save Record</Text>
              </Pressable>
            </View>
          )}

          {/* Record Cards */}
          {records.map((rec, idx) => (
            <View key={String(rec.id ?? idx)} style={styles.recordCard}>
              <Text style={styles.recordId}>ID: {String(rec.id ?? '—')}</Text>
              {fields.map((f) => (
                <View key={f.id} style={styles.recordFieldRow}>
                  <Text style={styles.recordFieldLabel}>{f.label}</Text>
                  <Text style={styles.recordFieldValue}>
                    {rec[f.apiName] === null || rec[f.apiName] === undefined
                      ? '—'
                      : String(rec[f.apiName])}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingBottom: 48,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  headerTextWrap: {
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  refreshBtn: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  refreshBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  signOutBtn: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  signOutBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#991B1B',
  },
  sessionBar: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 12,
  },
  sessionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#065F46',
  },
  errorBanner: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FCD34D',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginTop: 14,
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#78350F',
  },
  errorBody: {
    fontSize: 12,
    color: '#92400E',
    marginTop: 4,
  },
  objectPillsScroll: {
    marginTop: 16,
    marginBottom: 8,
  },
  objectPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#E2E8F0',
    marginRight: 8,
  },
  objectPillActive: {
    backgroundColor: '#0E8074',
  },
  objectPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  objectPillTextActive: {
    color: '#FFFFFF',
  },
  section: {
    marginTop: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  newRecordBtn: {
    backgroundColor: '#0E8074',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  newRecordBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: 14,
    marginTop: 14,
    marginBottom: 14,
  },
  formHeading: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 10,
  },
  fieldGroup: {
    marginBottom: 10,
  },
  booleanFieldGroup: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 4,
  },
  formulaNote: {
    fontSize: 12,
    fontStyle: 'italic',
    color: '#64748B',
  },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
  },
  submitBtn: {
    backgroundColor: '#0E8074',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 6,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  recordCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 10,
  },
  recordId: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 6,
  },
  recordFieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  recordFieldLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  recordFieldValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
  },
});
