#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  closeSync,
  constants as fsConstants,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";

import { Client, type QueryResultRow } from "pg";

import { resolveDatabaseConnectionOptions } from "../../../packages/api/src/db/ssl";
import { EXPECTED_DATABASE_MIGRATIONS } from "../src/generated/migration-manifest";
import {
  buildReconciliationCatalogReport,
  canonicalJson,
  collectReconciliationCatalog,
  redactAuditError,
  type JsonValue,
  type ReconciliationCatalogReport,
} from "./audit-migration-reconciliation";

/**
 * This command is deliberately separate from the ordinary deployment migrator.
 * It recognizes one immutable historical ledger and can replace only those
 * ledger rows with the current 0000 baseline. It never applies migration SQL.
 */

export const LEGACY_LEDGER_PROVENANCE_COMMIT =
  "f5d781ca354ec00450ee49e109642d243c5158af";
export const LEGACY_LEDGER_ADVISORY_LOCK =
  "school-sis:adopt-legacy-production-ledger:f5d781ca:v1";
// Keep this literal independent of deployment-migrations.ts: that reviewed
// transition input must not execute before its exact byte pin is verified.
export const DEPLOYMENT_MIGRATION_LOCK_NAME =
  "school-sis:deployment-migrations:v1";
export const ADOPTION_CONFIRMATION = "ADOPT_EXACT_F5D781CA_LEGACY_LEDGER_ONCE";
export const SNAPSHOT_CONFIRMATION =
  "CREATE_AND_RETAIN_HEAD_SNAPSHOT_UNDER_ADOPTION_WRITE_FREEZE";
export const RESTORE_DRILL_ATTESTATION =
  "NON_PRODUCTION_NEON_SNAPSHOT_RESTORE_DRILL_VERIFIED_AND_RUNBOOK_CURRENT";
export const EXACT_TENANT_RLS_SHA256 =
  "f83f0ddd4fd17953204642fc1411f62db2d8c42ee727cf1b95c69fefa4e0bdce";
export const EXACT_DEPLOYMENT_MIGRATIONS_SHA256 =
  "70a00006390ee6f8db9f900ac923ab564895c6347a7019be6ac4280cdc55fa20";
export const EXACT_TENANT_CONTEXT_KEY_CONTRACT_SHA256 =
  "73f4516603089e3d0291c459365deb9b0c34b96eb920c3c0adfd123ccada6009";
export const REVIEWED_FORWARD_RECONCILIATION = Object.freeze({
  disposition: "FORWARD_RECONCILIATION_0001_REVIEWED" as const,
  sourceEvidenceFingerprint:
    "626de193383d16680e1c53f3b251645518dc1180174b6d0941c540bf6ff67a27",
  sourceSchemaFingerprint:
    "dec34f08a27b074812b7166c0b4df8100afcac0d5f752f195bd2134b1984585d",
  targetEvidenceFingerprint:
    "ff046c96179bfac26313a1abfe40e4600712bf1248f0eba67968bfdfa793ce3e",
  targetEvidenceArtifactSha256:
    "b4fa27f1d4a1ce43ce3b94935e2533873143ebfbc290ce91bd7606ee4c6ffe72",
  targetSchemaFingerprint:
    "f58500dc0b7cc63c8781e8e082cab05b7bf14034be933121a1c5e58bd47779e9",
});
// Snapshot metadata is intentionally not committed here. This CLI creates a
// retained HEAD snapshot while its write-freeze locks are held and re-GETs the
// exact provider fields immediately before mutation and COMMIT.
export const REVIEWED_PRODUCTION_IDENTITY = Object.freeze({
  branchId: "br-hidden-union-ao8rd4ha",
  ownerRole: "neondb_owner",
  platformRole: "school_sis_platform",
  projectId: "wispy-leaf-40556376",
  runtimeRole: "school_sis_runtime",
});

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const COMMIT_SHA_PATTERN = /^[a-f0-9]{40}$/;
const GITHUB_REPOSITORY_PATTERN =
  /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const NEON_PROJECT_PATTERN = /^[a-z][a-z0-9-]{2,62}$/;
const NEON_BRANCH_PATTERN = /^br-[a-z0-9-]{3,80}$/;
const POSTGRES_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_$]{0,62}$/;
const DIRECT_NEON_HOST_PATTERN =
  /^ep-[a-z0-9-]+(?:\.[a-z0-9-]+)+\.aws\.neon\.tech$/;
const MAX_APPROVAL_AGE_MS = 24 * 60 * 60 * 1_000;
const MAX_SNAPSHOT_AGE_MS = 60 * 60 * 1_000;
const MAX_SNAPSHOT_TO_APPROVAL_GAP_MS = 60 * 60 * 1_000;
export const MAX_ADOPTION_RUN_DURATION_MS = 10 * 60 * 1_000;
export const MINIMUM_LEDGER_SEQUENCE_RESERVE = 1_024;
export const SOURCE_EVIDENCE_ARTIFACT_FILENAME =
  "legacy-production-source-audit-v2.json";

export const ADOPTION_ENV = Object.freeze({
  approvalFingerprint: "LEGACY_LEDGER_ADOPTION_APPROVAL_FINGERPRINT",
  approvedAt: "LEGACY_LEDGER_ADOPTION_APPROVED_AT",
  approvedBy: "LEGACY_LEDGER_ADOPTION_APPROVED_BY",
  confirmation: "LEGACY_LEDGER_ADOPTION_CONFIRMATION",
  databaseUrl: "LEGACY_LEDGER_ADOPTION_DATABASE_URL",
  expectedBranchId: "LEGACY_LEDGER_ADOPTION_EXPECTED_NEON_BRANCH_ID",
  expectedDatabase: "LEGACY_LEDGER_ADOPTION_EXPECTED_DATABASE",
  expectedHistoricalCommit:
    "LEGACY_LEDGER_ADOPTION_EXPECTED_HISTORICAL_COMMIT_SHA",
  expectedHost: "LEGACY_LEDGER_ADOPTION_EXPECTED_NEON_HOST",
  expectedProjectId: "LEGACY_LEDGER_ADOPTION_EXPECTED_NEON_PROJECT_ID",
  expectedPlatformRole: "LEGACY_LEDGER_ADOPTION_EXPECTED_PLATFORM_ROLE",
  expectedRole: "LEGACY_LEDGER_ADOPTION_EXPECTED_ROLE",
  expectedRuntimeRole: "LEGACY_LEDGER_ADOPTION_EXPECTED_RUNTIME_ROLE",
  expectedTenantContextKeyId:
    "LEGACY_LEDGER_ADOPTION_EXPECTED_TENANT_CONTEXT_KEY_ID",
  expectedTenantContextSecretSha256:
    "LEGACY_LEDGER_ADOPTION_EXPECTED_TENANT_CONTEXT_SECRET_SHA256",
  githubCommitSha: "LEGACY_LEDGER_ADOPTION_GITHUB_COMMIT_SHA",
  githubPullRequestUrl: "LEGACY_LEDGER_ADOPTION_GITHUB_PULL_REQUEST_URL",
  githubRepository: "LEGACY_LEDGER_ADOPTION_GITHUB_REPOSITORY",
  githubRunUrl: "LEGACY_LEDGER_ADOPTION_GITHUB_RUN_URL",
  neonApiKey: "LEGACY_LEDGER_ADOPTION_NEON_API_KEY",
  reconciliationDisposition:
    "LEGACY_LEDGER_ADOPTION_RECONCILIATION_DISPOSITION",
  restoreDrillAttestation: "LEGACY_LEDGER_ADOPTION_RESTORE_DRILL_ATTESTATION",
  snapshotConfirmation: "LEGACY_LEDGER_ADOPTION_SNAPSHOT_CONFIRMATION",
  snapshotConsoleUrl: "LEGACY_LEDGER_ADOPTION_NEON_SNAPSHOT_CONSOLE_URL",
  snapshotName: "LEGACY_LEDGER_ADOPTION_NEON_SNAPSHOT_NAME",
  sourceEvidenceFingerprint:
    "LEGACY_LEDGER_ADOPTION_APPROVED_SOURCE_EVIDENCE_FINGERPRINT",
  sourceEvidenceUrl: "LEGACY_LEDGER_ADOPTION_SOURCE_EVIDENCE_URL",
  sourceSchemaFingerprint:
    "LEGACY_LEDGER_ADOPTION_APPROVED_SOURCE_SCHEMA_FINGERPRINT",
  sslMode: "LEGACY_LEDGER_ADOPTION_SSL_MODE",
  targetEvidenceFingerprint:
    "LEGACY_LEDGER_ADOPTION_APPROVED_TARGET_EVIDENCE_FINGERPRINT",
  targetEvidenceArtifactPath:
    "LEGACY_LEDGER_ADOPTION_TARGET_EVIDENCE_ARTIFACT_PATH",
  targetEvidenceArtifactSha256:
    "LEGACY_LEDGER_ADOPTION_TARGET_EVIDENCE_ARTIFACT_SHA256",
  targetEvidenceUrl: "LEGACY_LEDGER_ADOPTION_TARGET_EVIDENCE_URL",
  targetSchemaFingerprint:
    "LEGACY_LEDGER_ADOPTION_APPROVED_TARGET_SCHEMA_FINGERPRINT",
  tenantContextSigningSecret:
    "LEGACY_LEDGER_ADOPTION_TENANT_CONTEXT_SIGNING_SECRET",
} as const);

export type HistoricalLedgerEntry = {
  createdAt: string;
  hash: string;
  tag: string;
};

/**
 * Drizzle hashes are SHA-256 digests of the SQL blobs at the immutable commit
 * above. Timestamps are from that commit's meta/_journal.json.
 */
export const EXACT_LEGACY_LEDGER: readonly HistoricalLedgerEntry[] =
  Object.freeze([
    {
      tag: "0000_init_native_postgres",
      createdAt: "1782539228657",
      hash: "dc1ba340b7fa6a8c06595e11787af5dfce520c097ea0fbefb80dc99a2b416bc7",
    },
    {
      tag: "0001_lean_next_avengers",
      createdAt: "1782711446288",
      hash: "295e29b85ff2e54fcaaaa94d3b67fbf279d9ca4db28d606c95f110d8abf6ae79",
    },
    {
      tag: "0003_certain_kabuki",
      createdAt: "1782805759340",
      hash: "b4ed0d2c62cc3437d54f93e5573148dab02923f22a1d00d8cc7db714c2fd04d5",
    },
    {
      tag: "0004_payment_billing_architecture",
      createdAt: "1782864000000",
      hash: "8f5e03828dff2b050320c88ccfd3bbb5f9ea9a527777725423e3895c367c1ee0",
    },
    {
      tag: "0005_ai_agent_architecture",
      createdAt: "1782950400000",
      hash: "d4ea1f4e8a81d8dd4fdb5aac02681f702f95783d45676828582512c278d104f5",
    },
    {
      tag: "0006_metadata_platform_architecture",
      createdAt: "1783036800000",
      hash: "b441f5f08e6a401eaffd742002234c1a28b87f546c428eb03d6fdf8ddb1e7659",
    },
    {
      tag: "0007_integration_api_platform",
      createdAt: "1783123200000",
      hash: "fe4f8031564bdd6098a41dea35ee292f90155127b7b730dc27f4b9cbcc70303c",
    },
    {
      tag: "0008_background_jobs_notifications",
      createdAt: "1783209600000",
      hash: "f9f4d33e4076bd944957bdb87ed396c7f06bb76cb2c0368da7ff8b6dd61f1068",
    },
    {
      tag: "0009_observability_sre_architecture",
      createdAt: "1783296000000",
      hash: "919d06db2b9f8e78cf317c574a0310ff3f7c8124ab286c68517f0dda99b75534",
    },
    {
      tag: "0010_performance_scale_architecture",
      createdAt: "1783382400000",
      hash: "ad549b36205be10cebc8d94985b41e95751092d131c4ae481ec49620ff160868",
    },
    {
      tag: "0011_workflow_approval_engine",
      createdAt: "1783468800000",
      hash: "c130e418bfe33373c123ab58d09646605be90a9b7c48c82ad495ce0bdc677076",
    },
    {
      tag: "0012_operator_console_architecture",
      createdAt: "1783555200000",
      hash: "3ba7e115765aaa451699cbf59f64a9fe16eab9b6586f6a2b4fb5911743b22000",
    },
    {
      tag: "0013_reporting_analytics_bi_architecture",
      createdAt: "1783641600000",
      hash: "8759152ebb521bac4e16bedaedc450f713004a4eed6126cbfda3203368cc26b8",
    },
    {
      tag: "0014_workflow_approval_adoption",
      createdAt: "1783728000000",
      hash: "63deb27c7c0a6d6bc2673c05111bdde2a77e7eba1cdc47e50a60e9d45bd537c1",
    },
    {
      tag: "0015_audit_read_action",
      createdAt: "1784284251059",
      hash: "b982a832fd2a0a7d2304d03309532d5ba1424a7d8b368ed238a5e0fe19616ac1",
    },
    {
      tag: "0016_reconcile_snapshot_baseline",
      createdAt: "1784315203159",
      hash: "d17d62e99270c9700d25661b9f90c97f48aa40a451d3780535d4ec3048756e6f",
    },
  ]);

export const EXACT_ADOPTION_MIGRATION_CHAIN = Object.freeze([
  {
    tag: "0000_init_baseline",
    createdAt: "1784378219195",
    hash: "3dcdb89f02d6e39635bf288b760c44aa2c6b59d32411ce44ecf25f117c10d927",
  },
  {
    tag: "0001_reconcile_production_integrity",
    createdAt: "1786893284933",
    hash: "72b8ac66c6114b24a858d701a2f0fcfa44c3aed7d0c6d6fec53ba094a95bab5a",
  },
]);

export const EXPECTED_CHECK_CONSTRAINTS = Object.freeze([
  "background_job_attempts.background_job_attempts_attempt_check",
  "background_job_attempts.background_job_attempts_status_check",
  "background_jobs.background_jobs_attempts_check",
  "background_jobs.background_jobs_scope_check",
  "background_jobs.background_jobs_scope_tenant_check",
  "background_jobs.background_jobs_status_check",
  "bi_dashboards.bi_dashboard_status_check",
  "bi_dashboards.bi_dashboard_version_check",
  "bi_dashboards.bi_dashboards_scope_check",
  "bi_datasets.bi_dataset_status_check",
  "bi_datasets.bi_datasets_scope_check",
  "bi_datasets.bi_version_check",
  "bi_metric_snapshots.bi_metric_snapshot_period_check",
  "bi_metric_snapshots.bi_metric_snapshots_scope_check",
  "bi_report_definitions.bi_report_definition_status_check",
  "bi_report_definitions.bi_report_definitions_scope_check",
  "bi_report_runs.bi_report_run_status_check",
  "bi_report_runs.bi_report_runs_scope_check",
  "exams.exams_status_check",
  "integration_api_keys.integration_api_keys_status_check",
  "integration_audit_logs.integration_audit_logs_direction_check",
  "integration_audit_logs.integration_audit_logs_status_check",
  "integration_connections.integration_connections_mode_check",
  "integration_connections.integration_connections_status_check",
  "metadata_fields.metadata_fields_data_type_check",
  "metadata_fields.metadata_fields_status_check",
  "metadata_migration_jobs.metadata_migration_jobs_status_check",
  "metadata_objects.metadata_objects_status_check",
  "metadata_schema_versions.metadata_schema_versions_status_check",
  "notification_delivery_events.notification_delivery_events_status_check",
  "notification_outbox.notification_outbox_attempts_check",
  "notification_outbox.notification_outbox_channel_check",
  "notification_outbox.notification_outbox_status_check",
  "observability_events.observability_events_scope_check",
  "observability_events.observability_events_scope_tenant_check",
  "observability_events.observability_events_severity_check",
  "operator_console_action_logs.operator_console_actions_scope_check",
  "operator_console_action_logs.operator_console_actions_status_check",
  "operator_console_runbooks.operator_console_runbooks_scope_check",
  "operator_console_runbooks.operator_console_runbooks_severity_check",
  "operator_console_runbooks.operator_console_runbooks_status_check",
  "operator_console_runbooks.operator_console_runbooks_version_check",
  "operator_console_snapshots.operator_console_snapshots_scope_check",
  "operator_console_snapshots.operator_console_snapshots_score_check",
  "operator_console_snapshots.operator_console_snapshots_status_check",
  "slo_definitions.slo_definitions_scope_check",
  "slo_definitions.slo_definitions_scope_tenant_check",
  "slo_definitions.slo_definitions_target_check",
  "slo_measurements.slo_measurements_counts_check",
  "slo_measurements.slo_measurements_status_check",
  "sre_incidents.sre_incidents_occurrence_count_check",
  "sre_incidents.sre_incidents_scope_check",
  "sre_incidents.sre_incidents_scope_tenant_check",
  "sre_incidents.sre_incidents_severity_check",
  "sre_incidents.sre_incidents_status_check",
  "workflow_approval_delegations.workflow_approval_delegations_time_check",
  "workflow_approval_events.workflow_approval_events_type_check",
  "workflow_approval_requests.workflow_approval_requests_counts_check",
  "workflow_approval_requests.workflow_approval_requests_priority_check",
  "workflow_approval_requests.workflow_approval_requests_status_check",
  "workflow_approval_reviews.workflow_approval_reviews_decision_check",
]);

type ExpectedIndex = {
  columns: readonly string[];
  definition: string;
  name: string;
  partial: boolean;
  relation: string;
  unique: boolean;
};

export const EXPECTED_RECONCILIATION_INDEXES: readonly ExpectedIndex[] =
  Object.freeze([
    {
      name: "idx_exams_tenant_status",
      relation: "exams",
      unique: false,
      partial: false,
      columns: ["tenant_id", "status"],
      definition:
        "CREATE INDEX idx_exams_tenant_status ON public.exams USING btree (tenant_id, status)",
    },
    {
      name: "idx_metadata_records_tenant_object",
      relation: "metadata_records",
      unique: false,
      partial: false,
      columns: ["tenant_id", "object_id"],
      definition:
        "CREATE INDEX idx_metadata_records_tenant_object ON public.metadata_records USING btree (tenant_id, object_id)",
    },
    {
      name: "uq_exam_result_hashes_result",
      relation: "exam_result_hashes",
      unique: true,
      partial: false,
      columns: ["result_id"],
      definition:
        "CREATE UNIQUE INDEX uq_exam_result_hashes_result ON public.exam_result_hashes USING btree (result_id)",
    },
    {
      name: "uq_metadata_objects_system_api_name",
      relation: "metadata_objects",
      unique: true,
      partial: true,
      columns: ["api_name"],
      definition:
        "CREATE UNIQUE INDEX uq_metadata_objects_system_api_name ON public.metadata_objects USING btree (api_name) WHERE ((tenant_id IS NULL) AND ((status)::text <> 'ARCHIVED'::text))",
    },
  ]);

export const EXPECTED_TRIGGERS = Object.freeze([
  "invoices.trg_invoice_changes",
  "students.trg_student_changes",
]);

export interface AdoptionApprovalMaterial {
  approvedAt: string;
  approvedBy: string;
  expectedBranchId: string;
  expectedDatabase: string;
  expectedHistoricalCommit: string;
  expectedHost: string;
  expectedProjectId: string;
  expectedPlatformRole: string;
  expectedRole: string;
  expectedRuntimeRole: string;
  expectedTenantContextKeyId: string;
  expectedTenantContextSecretSha256: string;
  githubCommitSha: string;
  githubPullRequestUrl: string;
  githubRepository: string;
  githubRunAttempt: "1";
  githubRunUrl: string;
  reconciliationDisposition: typeof REVIEWED_FORWARD_RECONCILIATION.disposition;
  restoreDrillAttestation: typeof RESTORE_DRILL_ATTESTATION;
  snapshotConsoleUrl: string;
  snapshotName: string;
  sourceEvidenceFingerprint: string;
  sourceEvidenceUrl: string;
  sourceSchemaFingerprint: string;
  targetEvidenceFingerprint: string;
  targetEvidenceArtifactSha256: string;
  targetEvidenceUrl: string;
  targetSchemaFingerprint: string;
}

export interface AdoptionConfiguration extends AdoptionApprovalMaterial {
  approvalFingerprint: string;
  connectionString: string;
  enableChannelBinding: true;
  ssl: { rejectUnauthorized: boolean };
  targetEvidenceArtifactPath: string;
}

export interface NeonRecoverySnapshotEvidence {
  createdAt: string;
  fullSize: string;
  id: string;
  manual: true;
  name: string;
  sourceBranchId: string;
}

export interface LedgerRow {
  created_at: unknown;
  hash: unknown;
  id?: unknown;
}

export interface AdoptionRoleMembershipEdge {
  admin_option: boolean;
  granted_role: string;
  grantor_role: string;
  inherit_option: boolean;
  member_role: string;
  set_option: boolean;
}

export interface LedgerTableContract {
  columnContract: string[];
  constraintCount: number;
  forceRls: boolean;
  indexCount: number;
  incomingForeignKeyCount: number;
  inheritanceCount: number;
  nonInternalTriggerCount: number;
  persistence: string;
  policyCount: number;
  publicationCount: number;
  primaryConstraintDefinition: string | null;
  primaryConstraintCount: number;
  primaryIndexDefinition: string | null;
  primaryIndexCount: number;
  relationKind: string;
  rls: boolean;
  ruleCount: number;
  runtimeBypassesRls: boolean;
  runtimeCanCreateCurrentDatabase: boolean;
  runtimeCanCreateDatabase: boolean;
  runtimeCanCreateRole: boolean;
  runtimeCanLogin: boolean;
  runtimeDrizzleSchemaPrivileges: string[];
  runtimeLedgerPrivileges: string[];
  runtimeRoleMemberships: AdoptionRoleMembershipEdge[];
  runtimeOwnedObjectCount: number;
  runtimeOwnsDatabase: boolean;
  runtimeReplication: boolean;
  runtimeRoleConfig: string[];
  runtimeRoleDatabaseSettingCount: number;
  runtimeRoleName: string;
  runtimeSequencePrivileges: string[];
  runtimeSuperuser: boolean;
  platformBypassesRls: boolean;
  platformCanCreateCurrentDatabase: boolean;
  platformCanCreateDatabase: boolean;
  platformCanCreateRole: boolean;
  platformCanLogin: boolean;
  platformDrizzleSchemaPrivileges: string[];
  platformLedgerPrivileges: string[];
  platformRoleMemberships: AdoptionRoleMembershipEdge[];
  platformOwnedObjectCount: number;
  platformOwnsDatabase: boolean;
  platformReplication: boolean;
  platformRoleConfig: string[];
  platformRoleDatabaseSettingCount: number;
  platformRoleName: string;
  platformSequencePrivileges: string[];
  platformSuperuser: boolean;
  schemaAcl: string[];
  schemaOwner: string;
  serverVersionNumber: number;
  sequenceAcl: string[];
  sequenceCacheSize: string;
  sequenceCycle: boolean;
  sequenceDataType: string;
  sequenceIncrement: string;
  sequenceIsCalled: boolean;
  sequenceLastValue: string;
  sequenceMaxValue: string;
  sequenceMinValue: string;
  sequenceOwner: string;
  sequenceOwnerMatchesLedger: boolean;
  sequencePersistence: string;
  sequenceStartValue: string;
  serialSequence: string | null;
  tableAcl: string[];
  tableColumnAclCount: number;
  tableOwner: string;
  totalTriggerCount: number;
  maximumLedgerId: number;
}

export interface AdoptionIdentity {
  branchIdSetting: string | null;
  database: string;
  ledgerOwner: string;
  migrationOwnerCanSignalBackends: boolean;
  projectIdSetting: string | null;
  role: string;
  roleBypassesRls: boolean;
  sessionRole: string;
}

export interface CatalogInvariants {
  checkConstraintKeys: string[];
  dataViolationCount: number;
  dataViolationCounts: Record<DataViolationKey, number>;
  forcedRlsTableCount: number;
  indexes: Array<{
    columns: string[];
    definition: string;
    live: boolean;
    name: string;
    partial: boolean;
    ready: boolean;
    relation: string;
    unique: boolean;
    valid: boolean;
  }>;
  integrationModeDefault: "LIVE" | "MOCK";
  invalidIndexCount: number;
  policyCoveredTableCount: number;
  publicColumnAclCount: number;
  publicTableCount: number;
  rlsBypassedTableCount: number;
  rlsTableCount: number;
  triggers: Array<{
    enabled: string;
    functionName: string;
    name: string;
    relation: string;
    triggerType: number;
  }>;
  unvalidatedConstraintCount: number;
}

export const DATA_VIOLATION_KEYS = Object.freeze([
  "duplicate_exam_result_hash_links",
  "duplicate_system_metadata_api_names",
  "invalid_integration_modes",
  "invalid_metadata_record_object_scope",
  "invalid_metadata_value_chain",
  "null_bi_dashboards_tenant",
  "null_bi_datasets_tenant",
  "null_exam_index_fields",
  "null_exam_result_hash_links",
  "null_metadata_record_links",
  "null_operator_console_runbooks_tenant",
  "null_system_metadata_api_names",
] as const);
export type DataViolationKey = (typeof DATA_VIOLATION_KEYS)[number];

export interface AdoptionEvidence {
  audit: ReconciliationCatalogReport;
  identity: AdoptionIdentity;
  invariants: CatalogInvariants;
}

export interface AdoptionResult {
  advisoryLockCleanup: "confirmed" | "released-by-connection-close";
  adoptedBaseline: {
    createdAt: string;
    hash: string;
    tag: string;
  };
  approvalFingerprint: string;
  historicalLedgerProvenanceCommit: string;
  pendingMigration: string;
  reconciliationDisposition: AdoptionApprovalMaterial["reconciliationDisposition"];
  recoverySnapshot: NeonRecoverySnapshotEvidence;
  sourceEvidenceArtifactSha256: string;
  sourceEvidenceFingerprint: string;
  sourceSchemaFingerprint: string;
  status: "adopted" | "adopted-with-lock-cleanup-warning";
  targetEvidenceFingerprint: string;
  targetSchemaFingerprint: string;
}

export interface SourceEvidenceArtifact {
  byteLength: number;
  path: string;
  sha256: string;
}

export interface SqlClient {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Row[]; rowCount?: number | null }>;
}

export class AdoptionCommitOutcomeUnknownError extends Error {
  constructor() {
    super(
      "The mutation COMMIT acknowledgement was lost; inspect the exact ledger and do not retry automatically.",
    );
    this.name = "AdoptionCommitOutcomeUnknownError";
  }
}

export class AdoptionPostCommitVerificationError extends Error {
  constructor() {
    super(
      "Ledger adoption committed, but the fresh post-commit reconciliation failed; stop and inspect before migration.",
    );
    this.name = "AdoptionPostCommitVerificationError";
  }
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function assertPattern(value: string, pattern: RegExp, name: string): string {
  if (!pattern.test(value)) throw new Error(`${name} has an invalid format.`);
  return value;
}

function parseRecentIsoTimestamp(
  value: string,
  name: string,
  now: Date,
  maximumAgeMs: number,
): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`${name} must be ISO-8601.`);
  if (timestamp > now.getTime() + 60_000) {
    throw new Error(`${name} cannot be in the future.`);
  }
  if (now.getTime() - timestamp > maximumAgeMs) {
    throw new Error(`${name} is too old for this one-time operation.`);
  }
  return new Date(timestamp).toISOString();
}

export function assertAdoptionTimingIsFresh(
  material: Pick<AdoptionApprovalMaterial, "approvedAt">,
  snapshot: Pick<NeonRecoverySnapshotEvidence, "createdAt">,
  runStartedAt: Date,
  now = new Date(),
): void {
  assertAdoptionRunDeadline(runStartedAt, now);
  const nowMs = now.getTime();
  const approvedAtMs = Date.parse(material.approvedAt);
  const snapshotCreatedAtMs = Date.parse(snapshot.createdAt);
  if (!Number.isFinite(approvedAtMs) || !Number.isFinite(snapshotCreatedAtMs)) {
    throw new Error(
      "The approval or recovery snapshot has an invalid timestamp.",
    );
  }
  if (
    approvedAtMs > nowMs + 60_000 ||
    nowMs - approvedAtMs > MAX_APPROVAL_AGE_MS ||
    snapshotCreatedAtMs > nowMs + 60_000 ||
    nowMs - snapshotCreatedAtMs > MAX_SNAPSHOT_AGE_MS ||
    Math.abs(approvedAtMs - snapshotCreatedAtMs) >
      MAX_SNAPSHOT_TO_APPROVAL_GAP_MS
  ) {
    throw new Error(
      "The approval or recovery snapshot is no longer fresh enough for adoption.",
    );
  }
}

export function assertAdoptionRunDeadline(
  runStartedAt: Date,
  now = new Date(),
): void {
  const runStartedAtMs = runStartedAt.getTime();
  const nowMs = now.getTime();
  if (
    !Number.isFinite(runStartedAtMs) ||
    !Number.isFinite(nowMs) ||
    nowMs < runStartedAtMs ||
    nowMs - runStartedAtMs > MAX_ADOPTION_RUN_DURATION_MS
  ) {
    throw new Error("The one-time adoption exceeded its bounded run window.");
  }
}

function parseHttpsUrl(value: string, name: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid HTTPS URL.`);
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.hash
  ) {
    throw new Error(`${name} must be a credential-free HTTPS URL.`);
  }
  return parsed;
}

function assertGitHubRunUrl(
  value: string,
  repository: string,
  runId: string,
  name: string,
): string {
  const parsed = parseHttpsUrl(value, name);
  if (
    parsed.hostname !== "github.com" ||
    parsed.pathname.replace(/\/$/, "") !==
      `/${repository}/actions/runs/${runId}`
  ) {
    throw new Error(`${name} must identify the current GitHub Actions run.`);
  }
  return parsed.toString().replace(/\/$/, "");
}

function parseApprovalMaterial(
  environment: NodeJS.ProcessEnv,
  now: Date,
): AdoptionApprovalMaterial {
  const githubRepository = assertPattern(
    required(environment, ADOPTION_ENV.githubRepository),
    GITHUB_REPOSITORY_PATTERN,
    ADOPTION_ENV.githubRepository,
  );
  const githubCommitSha = assertPattern(
    required(environment, ADOPTION_ENV.githubCommitSha),
    COMMIT_SHA_PATTERN,
    ADOPTION_ENV.githubCommitSha,
  );
  const githubRunId = assertPattern(
    required(environment, "GITHUB_RUN_ID"),
    /^[1-9][0-9]{2,30}$/,
    "GITHUB_RUN_ID",
  );
  const githubRunAttempt = required(environment, "GITHUB_RUN_ATTEMPT");
  if (githubRunAttempt !== "1") {
    throw new Error(
      "Ledger adoption requires a fresh workflow dispatch and refuses reruns.",
    );
  }
  if (required(environment, "GITHUB_REPOSITORY") !== githubRepository) {
    throw new Error(
      "GITHUB_REPOSITORY does not match the approved repository.",
    );
  }
  if (required(environment, "GITHUB_SHA") !== githubCommitSha) {
    throw new Error("GITHUB_SHA does not match the approved commit.");
  }
  if (required(environment, "GITHUB_EVENT_NAME") !== "workflow_dispatch") {
    throw new Error("Ledger adoption requires a workflow_dispatch run.");
  }
  if (required(environment, "GITHUB_REF_PROTECTED") !== "true") {
    throw new Error("Ledger adoption requires a protected GitHub ref.");
  }
  if (
    required(environment, "GITHUB_REF_TYPE") !== "branch" ||
    required(environment, "GITHUB_REF_NAME") !== "main" ||
    required(environment, "GITHUB_REF") !== "refs/heads/main"
  ) {
    throw new Error(
      "Ledger adoption is restricted to the protected main branch.",
    );
  }
  const approvedBy = assertPattern(
    required(environment, ADOPTION_ENV.approvedBy),
    /^[A-Za-z0-9-]{1,39}$/,
    ADOPTION_ENV.approvedBy,
  );
  if (
    required(environment, "GITHUB_ACTOR") !== approvedBy ||
    required(environment, "GITHUB_TRIGGERING_ACTOR") !== approvedBy
  ) {
    throw new Error(
      "The approving operator must be both the GitHub actor and triggering actor.",
    );
  }
  const githubRunUrl = assertGitHubRunUrl(
    required(environment, ADOPTION_ENV.githubRunUrl),
    githubRepository,
    githubRunId,
    ADOPTION_ENV.githubRunUrl,
  );
  const pullRequestUrl = parseHttpsUrl(
    required(environment, ADOPTION_ENV.githubPullRequestUrl),
    ADOPTION_ENV.githubPullRequestUrl,
  );
  if (
    pullRequestUrl.hostname !== "github.com" ||
    !new RegExp(
      `^/${githubRepository.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/pull/[1-9][0-9]*$`,
    ).test(pullRequestUrl.pathname.replace(/\/$/, ""))
  ) {
    throw new Error(
      `${ADOPTION_ENV.githubPullRequestUrl} must identify an approved pull request in the repository.`,
    );
  }
  const expectedProjectId = assertPattern(
    required(environment, ADOPTION_ENV.expectedProjectId),
    NEON_PROJECT_PATTERN,
    ADOPTION_ENV.expectedProjectId,
  );
  const expectedBranchId = assertPattern(
    required(environment, ADOPTION_ENV.expectedBranchId),
    NEON_BRANCH_PATTERN,
    ADOPTION_ENV.expectedBranchId,
  );
  const snapshotConsoleUrl = parseHttpsUrl(
    required(environment, ADOPTION_ENV.snapshotConsoleUrl),
    ADOPTION_ENV.snapshotConsoleUrl,
  );
  if (
    snapshotConsoleUrl.hostname !== "console.neon.tech" ||
    !snapshotConsoleUrl.pathname
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .includes(expectedProjectId) ||
    !snapshotConsoleUrl.pathname
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .includes(expectedBranchId)
  ) {
    throw new Error(
      `${ADOPTION_ENV.snapshotConsoleUrl} must be a Neon console URL for the expected project.`,
    );
  }
  const sourceEvidenceUrl = assertGitHubRunUrl(
    required(environment, ADOPTION_ENV.sourceEvidenceUrl),
    githubRepository,
    githubRunId,
    ADOPTION_ENV.sourceEvidenceUrl,
  );
  const targetEvidenceUrl = assertGitHubRunUrl(
    required(environment, ADOPTION_ENV.targetEvidenceUrl),
    githubRepository,
    githubRunId,
    ADOPTION_ENV.targetEvidenceUrl,
  );
  const material: AdoptionApprovalMaterial = {
    approvedAt: parseRecentIsoTimestamp(
      required(environment, ADOPTION_ENV.approvedAt),
      ADOPTION_ENV.approvedAt,
      now,
      MAX_APPROVAL_AGE_MS,
    ),
    approvedBy,
    expectedBranchId,
    expectedDatabase: assertPattern(
      required(environment, ADOPTION_ENV.expectedDatabase),
      POSTGRES_IDENTIFIER_PATTERN,
      ADOPTION_ENV.expectedDatabase,
    ),
    expectedHistoricalCommit: required(
      environment,
      ADOPTION_ENV.expectedHistoricalCommit,
    ),
    expectedHost: required(
      environment,
      ADOPTION_ENV.expectedHost,
    ).toLowerCase(),
    expectedProjectId,
    expectedPlatformRole: assertPattern(
      required(environment, ADOPTION_ENV.expectedPlatformRole),
      POSTGRES_IDENTIFIER_PATTERN,
      ADOPTION_ENV.expectedPlatformRole,
    ),
    expectedRole: assertPattern(
      required(environment, ADOPTION_ENV.expectedRole),
      POSTGRES_IDENTIFIER_PATTERN,
      ADOPTION_ENV.expectedRole,
    ),
    expectedRuntimeRole: assertPattern(
      required(environment, ADOPTION_ENV.expectedRuntimeRole),
      POSTGRES_IDENTIFIER_PATTERN,
      ADOPTION_ENV.expectedRuntimeRole,
    ),
    expectedTenantContextKeyId: assertPattern(
      required(environment, ADOPTION_ENV.expectedTenantContextKeyId),
      /^[a-z0-9][a-z0-9._-]{0,31}$/,
      ADOPTION_ENV.expectedTenantContextKeyId,
    ),
    expectedTenantContextSecretSha256: assertPattern(
      required(environment, ADOPTION_ENV.expectedTenantContextSecretSha256),
      SHA256_PATTERN,
      ADOPTION_ENV.expectedTenantContextSecretSha256,
    ),
    githubCommitSha,
    githubPullRequestUrl: pullRequestUrl.toString().replace(/\/$/, ""),
    githubRepository,
    githubRunAttempt,
    githubRunUrl,
    reconciliationDisposition: required(
      environment,
      ADOPTION_ENV.reconciliationDisposition,
    ) as AdoptionApprovalMaterial["reconciliationDisposition"],
    restoreDrillAttestation: required(
      environment,
      ADOPTION_ENV.restoreDrillAttestation,
    ) as AdoptionApprovalMaterial["restoreDrillAttestation"],
    snapshotConsoleUrl: snapshotConsoleUrl.toString(),
    snapshotName: assertPattern(
      required(environment, ADOPTION_ENV.snapshotName),
      /^[^\u0000-\u001f\u007f]{3,240}$/,
      ADOPTION_ENV.snapshotName,
    ),
    sourceEvidenceFingerprint: assertPattern(
      required(environment, ADOPTION_ENV.sourceEvidenceFingerprint),
      SHA256_PATTERN,
      ADOPTION_ENV.sourceEvidenceFingerprint,
    ),
    sourceEvidenceUrl,
    sourceSchemaFingerprint: assertPattern(
      required(environment, ADOPTION_ENV.sourceSchemaFingerprint),
      SHA256_PATTERN,
      ADOPTION_ENV.sourceSchemaFingerprint,
    ),
    targetEvidenceFingerprint: assertPattern(
      required(environment, ADOPTION_ENV.targetEvidenceFingerprint),
      SHA256_PATTERN,
      ADOPTION_ENV.targetEvidenceFingerprint,
    ),
    targetEvidenceArtifactSha256: assertPattern(
      required(environment, ADOPTION_ENV.targetEvidenceArtifactSha256),
      SHA256_PATTERN,
      ADOPTION_ENV.targetEvidenceArtifactSha256,
    ),
    targetEvidenceUrl,
    targetSchemaFingerprint: assertPattern(
      required(environment, ADOPTION_ENV.targetSchemaFingerprint),
      SHA256_PATTERN,
      ADOPTION_ENV.targetSchemaFingerprint,
    ),
  };
  if (material.expectedHistoricalCommit !== LEGACY_LEDGER_PROVENANCE_COMMIT) {
    throw new Error(
      `${ADOPTION_ENV.expectedHistoricalCommit} does not identify the immutable legacy ledger source.`,
    );
  }
  if (!DIRECT_NEON_HOST_PATTERN.test(material.expectedHost)) {
    throw new Error(`${ADOPTION_ENV.expectedHost} must be a direct Neon host.`);
  }
  if (
    new Set([
      material.expectedRole,
      material.expectedRuntimeRole,
      material.expectedPlatformRole,
    ]).size !== 3
  ) {
    throw new Error(
      "The migration owner, tenant runtime role, and platform role must be distinct.",
    );
  }
  if (material.expectedHost.includes("-pooler")) {
    throw new Error(
      `${ADOPTION_ENV.expectedHost} cannot be a pooled Neon host.`,
    );
  }
  if (
    material.sourceEvidenceFingerprint === material.targetEvidenceFingerprint
  ) {
    throw new Error(
      "Source and target evidence must be independently fingerprinted.",
    );
  }
  if (
    material.reconciliationDisposition !==
    REVIEWED_FORWARD_RECONCILIATION.disposition
  ) {
    throw new Error(
      `${ADOPTION_ENV.reconciliationDisposition} must select the one reviewed 0001 reconciliation.`,
    );
  }
  if (material.restoreDrillAttestation !== RESTORE_DRILL_ATTESTATION) {
    throw new Error(
      `${ADOPTION_ENV.restoreDrillAttestation} does not attest the reviewed non-production restore drill.`,
    );
  }
  for (const field of [
    "sourceEvidenceFingerprint",
    "sourceSchemaFingerprint",
    "targetEvidenceArtifactSha256",
    "targetEvidenceFingerprint",
    "targetSchemaFingerprint",
  ] as const) {
    if (material[field] !== REVIEWED_FORWARD_RECONCILIATION[field]) {
      throw new Error(
        `${field} is not the pinned reviewed reconciliation value.`,
      );
    }
  }
  if (material.sourceSchemaFingerprint === material.targetSchemaFingerprint) {
    throw new Error(
      "The reviewed forward reconciliation requires distinct source and target schemas.",
    );
  }
  const exactSnapshotName = `legacy-adoption-${material.githubCommitSha.slice(0, 12)}-${githubRunId}`;
  if (material.snapshotName !== exactSnapshotName) {
    throw new Error(
      "The recovery snapshot name is not exact for this commit and workflow run.",
    );
  }
  if (
    material.expectedProjectId !== REVIEWED_PRODUCTION_IDENTITY.projectId ||
    material.expectedBranchId !== REVIEWED_PRODUCTION_IDENTITY.branchId ||
    material.expectedRole !== REVIEWED_PRODUCTION_IDENTITY.ownerRole ||
    material.expectedPlatformRole !==
      REVIEWED_PRODUCTION_IDENTITY.platformRole ||
    material.expectedRuntimeRole !== REVIEWED_PRODUCTION_IDENTITY.runtimeRole
  ) {
    throw new Error(
      "The approval envelope does not identify the reviewed production database.",
    );
  }
  const { pending } = resolveCurrentBaseline();
  if (pending.tag !== "0001_reconcile_production_integrity") {
    throw new Error(
      "The reviewed forward reconciliation migration is not exactly 0001_reconcile_production_integrity.",
    );
  }
  return material;
}

export function buildAdoptionApprovalFingerprint(
  material: AdoptionApprovalMaterial,
): string {
  const canonicalMaterial: Record<string, string> = { ...material };
  return createHash("sha256")
    .update(canonicalJson(canonicalMaterial))
    .digest("hex");
}

export function computeAdoptionApprovalFingerprintFromEnvironment(
  environment: NodeJS.ProcessEnv,
  now = new Date(),
): string {
  return buildAdoptionApprovalFingerprint(
    parseApprovalMaterial(environment, now),
  );
}

function resolveProductionConnection(
  environment: NodeJS.ProcessEnv,
  material: AdoptionApprovalMaterial,
): Pick<
  AdoptionConfiguration,
  "connectionString" | "enableChannelBinding" | "ssl"
> {
  const raw = required(environment, ADOPTION_ENV.databaseUrl);
  if (required(environment, ADOPTION_ENV.sslMode) !== "verify-full") {
    throw new Error(`${ADOPTION_ENV.sslMode} must be verify-full.`);
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(
      `${ADOPTION_ENV.databaseUrl} must be a valid PostgreSQL URL.`,
    );
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error(`${ADOPTION_ENV.databaseUrl} must use PostgreSQL.`);
  }
  if (parsed.hostname.toLowerCase() !== material.expectedHost) {
    throw new Error(
      `${ADOPTION_ENV.databaseUrl} host does not match approval.`,
    );
  }
  if (
    !DIRECT_NEON_HOST_PATTERN.test(parsed.hostname.toLowerCase()) ||
    parsed.hostname.toLowerCase().includes("-pooler")
  ) {
    throw new Error(`${ADOPTION_ENV.databaseUrl} must use a direct Neon host.`);
  }
  if (parsed.port && parsed.port !== "5432") {
    throw new Error(
      `${ADOPTION_ENV.databaseUrl} must use PostgreSQL port 5432.`,
    );
  }
  if (!parsed.username || !parsed.password) {
    throw new Error(
      `${ADOPTION_ENV.databaseUrl} must include role credentials.`,
    );
  }
  let role: string;
  let database: string;
  try {
    role = decodeURIComponent(parsed.username);
    database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  } catch {
    throw new Error(
      `${ADOPTION_ENV.databaseUrl} contains invalid URL encoding.`,
    );
  }
  if (
    database.includes("/") ||
    role !== material.expectedRole ||
    database !== material.expectedDatabase
  ) {
    throw new Error(
      `${ADOPTION_ENV.databaseUrl} identity does not match approval.`,
    );
  }
  if (parsed.hash) {
    throw new Error(`${ADOPTION_ENV.databaseUrl} must not contain a fragment.`);
  }
  const queryKeys = [...parsed.searchParams.keys()].map((key) =>
    key.toLowerCase(),
  );
  const allowedKeys = new Set(["sslmode", "channel_binding"]);
  const forbiddenKeys = queryKeys.filter((key) => !allowedKeys.has(key));
  if (forbiddenKeys.length > 0) {
    throw new Error(
      `${ADOPTION_ENV.databaseUrl} contains forbidden connection option(s).`,
    );
  }
  if (
    parsed.searchParams.getAll("sslmode").length !== 1 ||
    parsed.searchParams.get("sslmode") !== "verify-full"
  ) {
    throw new Error(
      `${ADOPTION_ENV.databaseUrl} requires sslmode=verify-full.`,
    );
  }
  if (
    parsed.searchParams.getAll("channel_binding").length !== 1 ||
    parsed.searchParams.get("channel_binding") !== "require"
  ) {
    throw new Error(
      `${ADOPTION_ENV.databaseUrl} requires channel_binding=require.`,
    );
  }
  const connection = resolveDatabaseConnectionOptions(raw, "verify-full");
  if (!connection.ssl?.rejectUnauthorized) {
    throw new Error("Strict certificate verification was not configured.");
  }
  return {
    connectionString: connection.connectionString,
    enableChannelBinding: true,
    ssl: { rejectUnauthorized: true },
  };
}

export function resolveAdoptionConfiguration(
  environment: NodeJS.ProcessEnv,
  now = new Date(),
): AdoptionConfiguration {
  if (
    required(environment, ADOPTION_ENV.confirmation) !== ADOPTION_CONFIRMATION
  ) {
    throw new Error(
      `${ADOPTION_ENV.confirmation} does not exactly confirm adoption.`,
    );
  }
  if (
    required(environment, ADOPTION_ENV.snapshotConfirmation) !==
    SNAPSHOT_CONFIRMATION
  ) {
    throw new Error(
      `${ADOPTION_ENV.snapshotConfirmation} does not exactly authorize same-run snapshot creation and retention.`,
    );
  }
  const material = parseApprovalMaterial(environment, now);
  const approvalFingerprint = assertPattern(
    required(environment, ADOPTION_ENV.approvalFingerprint),
    SHA256_PATTERN,
    ADOPTION_ENV.approvalFingerprint,
  );
  const computedFingerprint = buildAdoptionApprovalFingerprint(material);
  if (approvalFingerprint !== computedFingerprint) {
    throw new Error(
      "The adoption approval envelope fingerprint does not match.",
    );
  }
  return {
    ...material,
    ...resolveProductionConnection(environment, material),
    approvalFingerprint,
    targetEvidenceArtifactPath: required(
      environment,
      ADOPTION_ENV.targetEvidenceArtifactPath,
    ),
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

const TARGET_CATALOG_SECTIONS = Object.freeze([
  "columns",
  "constraints",
  "defaultPrivileges",
  "extensions",
  "functions",
  "indexes",
  "policies",
  "relations",
  "schemas",
  "sequences",
  "triggers",
  "types",
  "views",
] as const);

function targetRows(
  report: Record<string, unknown>,
  name: (typeof TARGET_CATALOG_SECTIONS)[number],
): Array<Record<string, unknown>> {
  const schema = asRecord(report.schema);
  const sections = asRecord(schema?.sections);
  const section = asRecord(sections?.[name]);
  if (!Array.isArray(section?.rows)) {
    throw new Error(`Target reconciliation evidence is missing ${name} rows.`);
  }
  const rows = section.rows.map(asRecord);
  if (rows.some((row) => !row)) {
    throw new Error(
      `Target reconciliation evidence has malformed ${name} rows.`,
    );
  }
  return rows as Array<Record<string, unknown>>;
}

type TargetCatalogRows = Parameters<
  typeof buildReconciliationCatalogReport
>[0]["catalogRows"];

function exactAcl(
  value: unknown,
  expected: readonly {
    grantee: string;
    privilege: string;
  }[],
  label: string,
): void {
  if (!Array.isArray(value)) {
    throw new Error(`${label} ACL evidence is malformed.`);
  }
  const actual = value.map((entry) => {
    const row = asRecord(entry);
    if (
      !row ||
      !hasExactKeys(row, ["grantable", "grantee", "grantor", "privilege"]) ||
      row.grantable !== false ||
      typeof row.grantee !== "string" ||
      row.grantor !== REVIEWED_PRODUCTION_IDENTITY.ownerRole ||
      typeof row.privilege !== "string"
    ) {
      throw new Error(`${label} ACL evidence is not exact.`);
    }
    return `${row.grantee}:${row.privilege}`;
  });
  const expectedKeys = expected.map(
    (entry) => `${entry.grantee}:${entry.privilege}`,
  );
  actual.sort();
  expectedKeys.sort();
  if (
    actual.length !== expectedKeys.length ||
    actual.some((entry, index) => entry !== expectedKeys[index])
  ) {
    throw new Error(`${label} ACL evidence is not exact.`);
  }
}

function ownerAcl(privileges: readonly string[]) {
  return privileges.map((privilege) => ({
    grantee: REVIEWED_PRODUCTION_IDENTITY.ownerRole,
    privilege,
  }));
}

function applicationFunctionAcl() {
  return [
    ...ownerAcl(["EXECUTE"]),
    {
      grantee: REVIEWED_PRODUCTION_IDENTITY.platformRole,
      privilege: "EXECUTE",
    },
    {
      grantee: REVIEWED_PRODUCTION_IDENTITY.runtimeRole,
      privilege: "EXECUTE",
    },
  ];
}

function assertSignedTenantContextTargetCatalog(
  catalogRows: TargetCatalogRows,
): void {
  const pgcrypto = catalogRows.extensions.filter(
    (row) => row.name === "pgcrypto",
  );
  if (
    pgcrypto.length !== 1 ||
    pgcrypto[0]?.schema !== "public" ||
    pgcrypto[0]?.version !== "1.4"
  ) {
    throw new Error(
      "Target evidence does not contain the reviewed pgcrypto extension.",
    );
  }

  const appPrivateSchema = catalogRows.schemas.filter(
    (row) => row.name === "app_private",
  );
  if (
    appPrivateSchema.length !== 1 ||
    appPrivateSchema[0]?.owner !== REVIEWED_PRODUCTION_IDENTITY.ownerRole
  ) {
    throw new Error("Target app_private schema ownership is not exact.");
  }
  exactAcl(
    appPrivateSchema[0]?.acl,
    [
      ...ownerAcl(["CREATE", "USAGE"]),
      {
        grantee: REVIEWED_PRODUCTION_IDENTITY.platformRole,
        privilege: "USAGE",
      },
      {
        grantee: REVIEWED_PRODUCTION_IDENTITY.runtimeRole,
        privilege: "USAGE",
      },
    ],
    "Target app_private schema",
  );

  const privateTables = {
    tenant_context_rollout_state: {
      columns: [
        ["singleton", "boolean", true, "true", null],
        ["enforcement_phase", "smallint", true, "1", null],
        ["signed_runtime_sha", "text", false, null, "pg_catalog.default"],
        ["promoted_key_id", "text", false, null, "pg_catalog.default"],
        ["promoted_audience", "text", false, null, "pg_catalog.default"],
        ["promoted_deployment_id", "text", false, null, "pg_catalog.default"],
        ["promoted_at", "timestamp with time zone", false, null, null],
        ["temp_revoked_at", "timestamp with time zone", false, null, null],
        [
          "temp_drain_completed_at",
          "timestamp with time zone",
          false,
          null,
          null,
        ],
      ] as const,
      constraints: {
        tenant_context_rollout_state_audience: ["promoted_audience", "CHECK"],
        tenant_context_rollout_state_deployment_id: [
          "promoted_deployment_id",
          "CHECK",
        ],
        tenant_context_rollout_state_key_id: ["promoted_key_id", "CHECK"],
        tenant_context_rollout_state_phase: ["enforcement_phase", "CHECK"],
        tenant_context_rollout_state_pkey: ["PRIMARY KEY", "singleton"],
        tenant_context_rollout_state_promotion_complete: [
          "signed_runtime_sha",
          "promoted_key_id",
          "promoted_audience",
          "promoted_deployment_id",
          "promoted_at",
          "CHECK",
        ],
        tenant_context_rollout_state_sha: ["signed_runtime_sha", "CHECK"],
        tenant_context_rollout_state_singleton: ["singleton", "CHECK"],
        tenant_context_rollout_state_temp_drain_order: [
          "temp_drain_completed_at",
          "temp_revoked_at",
          "CHECK",
        ],
      },
      index: "tenant_context_rollout_state_pkey",
    },
    tenant_context_signing_keys: {
      columns: [
        ["key_id", "text", true, null, "pg_catalog.default"],
        ["audience", "text", true, null, "pg_catalog.default"],
        ["secret", "bytea", true, null, null],
        [
          "created_at",
          "timestamp with time zone",
          true,
          "clock_timestamp()",
          null,
        ],
      ] as const,
      constraints: {
        tenant_context_signing_keys_audience_format: ["audience", "CHECK"],
        tenant_context_signing_keys_key_id_format: ["key_id", "CHECK"],
        tenant_context_signing_keys_pkey: ["PRIMARY KEY", "key_id"],
        tenant_context_signing_keys_secret_length: [
          "octet_length(secret)",
          ">= 32",
          "<= 128",
          "CHECK",
        ],
      },
      index: "tenant_context_signing_keys_pkey",
    },
  } as const;

  for (const [tableName, expected] of Object.entries(privateTables)) {
    const relations = catalogRows.relations.filter(
      (row) => row.schema === "app_private" && row.name === tableName,
    );
    if (
      relations.length !== 1 ||
      relations[0]?.kind !== "r" ||
      relations[0].persistence !== "p" ||
      relations[0].rowSecurity !== false ||
      relations[0].forceRowSecurity !== false ||
      relations[0].partitionKey !== null ||
      relations[0].owner !== REVIEWED_PRODUCTION_IDENTITY.ownerRole
    ) {
      throw new Error(`Target private table ${tableName} is not exact.`);
    }
    exactAcl(
      relations[0].acl,
      ownerAcl([
        "DELETE",
        "INSERT",
        "MAINTAIN",
        "REFERENCES",
        "SELECT",
        "TRIGGER",
        "TRUNCATE",
        "UPDATE",
      ]),
      `Target private table ${tableName}`,
    );

    const columns = catalogRows.columns
      .filter(
        (row) => row.schema === "app_private" && row.relation === tableName,
      )
      .sort((left, right) => Number(left.position) - Number(right.position));
    if (
      columns.length !== expected.columns.length ||
      columns.some((column, index) => {
        const [name, type, notNull, defaultValue, collation] =
          expected.columns[index]!;
        return (
          column.position !== index + 1 ||
          column.name !== name ||
          column.type !== type ||
          column.notNull !== notNull ||
          column.default !== defaultValue ||
          column.collation !== collation ||
          column.identity !== "" ||
          column.generated !== ""
        );
      })
    ) {
      throw new Error(
        `Target private table ${tableName} columns are not exact.`,
      );
    }

    const constraints = catalogRows.constraints
      .filter(
        (row) =>
          row.schema === "app_private" &&
          row.relation === tableName &&
          row.type !== "n",
      )
      .map((row) => {
        const expectedTokens =
          expected.constraints[row.name as keyof typeof expected.constraints];
        const expectedType = row.name.endsWith("_pkey") ? "p" : "c";
        if (
          !expectedTokens ||
          row.type !== expectedType ||
          row.validated !== true ||
          row.deferrable !== false ||
          row.initiallyDeferred !== false ||
          typeof row.definition !== "string" ||
          expectedTokens.some((token) => !row.definition.includes(token))
        ) {
          throw new Error(
            `Target private table ${tableName} constraint is unsafe.`,
          );
        }
        return row.name;
      })
      .sort();
    const expectedConstraints = Object.keys(expected.constraints).sort();
    if (
      constraints.length !== expectedConstraints.length ||
      constraints.some(
        (constraint, index) => constraint !== expectedConstraints[index],
      )
    ) {
      throw new Error(
        `Target private table ${tableName} constraints are not exact.`,
      );
    }

    const indexes = catalogRows.indexes.filter(
      (row) => row.schema === "app_private" && row.relation === tableName,
    );
    if (
      indexes.length !== 1 ||
      indexes[0]?.name !== expected.index ||
      indexes[0].primary !== true ||
      indexes[0].unique !== true ||
      indexes[0].valid !== true ||
      indexes[0].ready !== true ||
      indexes[0].live !== true ||
      typeof indexes[0].definition !== "string" ||
      indexes[0].definition.length === 0 ||
      catalogRows.triggers.some(
        (row) => row.schema === "app_private" && row.relation === tableName,
      ) ||
      catalogRows.policies.some(
        (row) => row.schema === "app_private" && row.relation === tableName,
      )
    ) {
      throw new Error(
        `Target private table ${tableName} index/policy/trigger contract is unsafe.`,
      );
    }
  }

  const helperContract = [
    {
      acl: "owner",
      arguments: "left_value bytea, right_value bytea",
      definitionTokens: ["octet_length", "get_byte"],
      language: "plpgsql",
      name: "constant_time_equal_32",
      result: "boolean",
      securityDefiner: false,
      volatility: "i",
      configuration: ["search_path=pg_catalog, pg_temp"],
    },
    {
      acl: "application",
      arguments: "",
      definitionTokens: [
        "public.hmac",
        "pg_current_xact_id()",
        "constant_time_equal_32",
      ],
      language: "plpgsql",
      name: "verified_tenant_id",
      result: "uuid",
      securityDefiner: true,
      volatility: "s",
      configuration: ["search_path=pg_catalog, pg_temp"],
    },
    {
      acl: "application",
      arguments: "",
      definitionTokens: [
        "verified_tenant_id",
        "tenant_context_enforcement_phase",
      ],
      language: "plpgsql",
      name: "current_tenant_id",
      result: "uuid",
      securityDefiner: false,
      volatility: "s",
      configuration: null,
    },
    {
      acl: "application",
      arguments: "",
      definitionTokens: ["current_tenant_id"],
      language: "sql",
      name: "has_tenant_context",
      result: "boolean",
      securityDefiner: false,
      volatility: "s",
      configuration: null,
    },
    {
      acl: "application",
      arguments: "",
      definitionTokens: ["tenant_context_rollout_state"],
      language: "sql",
      name: "tenant_context_enforcement_phase",
      result: "smallint",
      securityDefiner: true,
      volatility: "s",
      configuration: ["search_path=pg_catalog, pg_temp"],
    },
    {
      acl: "application",
      arguments: "",
      definitionTokens: ["school_sis_platform", "school_sis_runtime"],
      language: "sql",
      name: "rls_bypass",
      result: "boolean",
      securityDefiner: false,
      volatility: "s",
      configuration: null,
    },
    {
      acl: "owner",
      arguments: "table_name text",
      definitionTokens: ["to_regclass"],
      language: "sql",
      name: "table_exists",
      result: "boolean",
      securityDefiner: false,
      volatility: "s",
      configuration: null,
    },
  ] as const;

  for (const expected of helperContract) {
    const helpers = catalogRows.functions.filter(
      (row) =>
        row.schema === "app_private" &&
        row.name === expected.name &&
        row.arguments === expected.arguments,
    );
    const helper = helpers[0];
    if (
      helpers.length !== 1 ||
      helper?.kind !== "f" ||
      helper.language !== expected.language ||
      helper.result !== expected.result ||
      helper.securityDefiner !== expected.securityDefiner ||
      helper.volatility !== expected.volatility ||
      helper.owner !== REVIEWED_PRODUCTION_IDENTITY.ownerRole ||
      typeof helper.definition !== "string" ||
      expected.definitionTokens.some(
        (token) => !helper.definition.includes(token),
      ) ||
      canonicalJson(helper.configuration as JsonValue) !==
        canonicalJson(expected.configuration as JsonValue)
    ) {
      throw new Error(`Target helper ${expected.name} is not exact.`);
    }
    exactAcl(
      helper.acl,
      expected.acl === "application"
        ? applicationFunctionAcl()
        : ownerAcl(["EXECUTE"]),
      `Target helper ${expected.name}`,
    );
  }
}

export function assertTargetReconciliationEvidence(
  value: unknown,
  configuration: AdoptionConfiguration,
): ReconciliationCatalogReport {
  const report = asRecord(value);
  const ledger = asRecord(report?.ledger);
  if (!report || !ledger || !Array.isArray(ledger.entries)) {
    throw new Error("Target reconciliation evidence is malformed.");
  }
  const catalogRows = Object.fromEntries(
    TARGET_CATALOG_SECTIONS.map((name) => [name, targetRows(report, name)]),
  ) as Parameters<typeof buildReconciliationCatalogReport>[0]["catalogRows"];
  const ledgerEntries = ledger.entries.map((entry) => {
    const row = asRecord(entry);
    if (
      !row ||
      typeof row.createdAt !== "string" ||
      typeof row.hash !== "string"
    ) {
      throw new Error("Target reconciliation ledger evidence is malformed.");
    }
    return { created_at: row.createdAt, hash: row.hash };
  });
  const rebuilt = buildReconciliationCatalogReport({
    catalogRows,
    ledgerEntries,
    ledgerExists: ledger.exists === true,
  });
  if (
    canonicalJson(report as unknown as JsonValue) !== canonicalJson(rebuilt) ||
    rebuilt.ledger.classification !== "current-chain" ||
    !rebuilt.invariants.ledgerIsExactCurrentChain ||
    rebuilt.schema.fingerprint !== configuration.targetSchemaFingerprint ||
    rebuilt.evidenceFingerprint !== configuration.targetEvidenceFingerprint
  ) {
    throw new Error(
      "Target evidence is not the exact approved canonical-runner target report.",
    );
  }
  assertSignedTenantContextTargetCatalog(catalogRows);

  const publicTables = catalogRows.relations.filter(
    (row) => row.schema === "public" && (row.kind === "r" || row.kind === "p"),
  );
  if (
    publicTables.length !== 144 ||
    publicTables.some(
      (table) => table.rowSecurity !== true || table.forceRowSecurity !== true,
    )
  ) {
    throw new Error(
      "Target evidence does not prove 144-table ENABLE/FORCE RLS.",
    );
  }
  const policyTables = new Set(
    catalogRows.policies
      .filter((policy) => policy.schema === "public")
      .map((policy) => policy.relation),
  );
  if (publicTables.some((table) => !policyTables.has(table.name))) {
    throw new Error(
      "Target evidence has a public table without an RLS policy.",
    );
  }
  const checks = catalogRows.constraints
    .filter(
      (constraint) => constraint.schema === "public" && constraint.type === "c",
    )
    .map((constraint) => {
      if (constraint.validated !== true) {
        throw new Error(
          "Target evidence contains an unvalidated CHECK constraint.",
        );
      }
      return `${constraint.relation}.${constraint.name}`;
    })
    .sort();
  if (
    checks.length !== EXPECTED_CHECK_CONSTRAINTS.length ||
    checks.some((key, index) => key !== EXPECTED_CHECK_CONSTRAINTS[index])
  ) {
    throw new Error("Target evidence does not contain the reviewed 61 CHECKs.");
  }
  if (
    catalogRows.constraints.some(
      (constraint) => constraint.validated !== true,
    ) ||
    catalogRows.indexes.some(
      (index) =>
        index.valid !== true || index.ready !== true || index.live !== true,
    )
  ) {
    throw new Error("Target evidence contains invalid catalog objects.");
  }
  if (catalogRows.defaultPrivileges?.length !== 4) {
    throw new Error(
      "Target evidence does not contain the reviewed default privileges.",
    );
  }
  const indexKeys = catalogRows.indexes
    .filter(
      (index) =>
        index.schema === "public" &&
        EXPECTED_RECONCILIATION_INDEXES.some(
          (expected) => expected.name === index.name,
        ),
    )
    .map((index) => `${index.relation}.${index.name}`)
    .sort();
  const expectedIndexKeys = EXPECTED_RECONCILIATION_INDEXES.map(
    (index) => `${index.relation}.${index.name}`,
  ).sort();
  if (
    indexKeys.length !== expectedIndexKeys.length ||
    indexKeys.some((key, index) => key !== expectedIndexKeys[index])
  ) {
    throw new Error(
      "Target evidence does not contain the four reviewed indexes.",
    );
  }
  const triggerKeys = catalogRows.triggers
    .filter((trigger) => trigger.schema === "public")
    .map((trigger) => `${trigger.relation}.${trigger.name}`)
    .sort();
  if (
    triggerKeys.length !== EXPECTED_TRIGGERS.length ||
    triggerKeys.some((key, index) => key !== EXPECTED_TRIGGERS[index])
  ) {
    throw new Error(
      "Target evidence does not contain the two reviewed triggers.",
    );
  }
  const integrationMode = catalogRows.columns.find(
    (column) =>
      column.schema === "public" &&
      column.relation === "integration_connections" &&
      column.name === "mode",
  );
  if (
    typeof integrationMode?.default !== "string" ||
    !integrationMode.default.includes("'LIVE'")
  ) {
    throw new Error(
      "Target evidence does not prove the LIVE integration default.",
    );
  }
  return rebuilt;
}

export function loadAndAssertTargetReconciliationEvidence(
  configuration: AdoptionConfiguration,
  environment: NodeJS.ProcessEnv,
): ReconciliationCatalogReport {
  const runnerTempValue = required(environment, "RUNNER_TEMP");
  const artifactPath = configuration.targetEvidenceArtifactPath;
  if (!isAbsolute(artifactPath)) {
    throw new Error(
      `${ADOPTION_ENV.targetEvidenceArtifactPath} must be absolute.`,
    );
  }
  let runnerTemp: string;
  let realArtifactPath: string;
  try {
    runnerTemp = realpathSync(resolve(runnerTempValue));
    const artifactStat = lstatSync(artifactPath);
    if (!artifactStat.isFile() || artifactStat.isSymbolicLink()) {
      throw new Error("not a regular file");
    }
    realArtifactPath = realpathSync(artifactPath);
    if (
      realArtifactPath !== runnerTemp &&
      !realArtifactPath.startsWith(`${runnerTemp}${sep}`)
    ) {
      throw new Error("outside RUNNER_TEMP");
    }
    if (artifactStat.size < 2 || artifactStat.size > 50_000_000) {
      throw new Error("unexpected file size");
    }
  } catch {
    throw new Error(
      `${ADOPTION_ENV.targetEvidenceArtifactPath} must be a regular file inside RUNNER_TEMP.`,
    );
  }
  const bytes = readFileSync(realArtifactPath);
  const artifactSha256 = createHash("sha256").update(bytes).digest("hex");
  if (artifactSha256 !== configuration.targetEvidenceArtifactSha256) {
    throw new Error("Target reconciliation artifact SHA-256 is not approved.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("Target reconciliation artifact is not valid JSON.");
  }
  return assertTargetReconciliationEvidence(parsed, configuration);
}

export function writeSourceReconciliationEvidenceArtifact(
  report: ReconciliationCatalogReport,
  environment: NodeJS.ProcessEnv,
): SourceEvidenceArtifact {
  let runnerTemp: string;
  try {
    runnerTemp = realpathSync(resolve(required(environment, "RUNNER_TEMP")));
  } catch {
    throw new Error("RUNNER_TEMP must identify an existing private directory.");
  }
  const artifactPath = resolve(runnerTemp, SOURCE_EVIDENCE_ARTIFACT_FILENAME);
  const bytes = `${canonicalJson(report)}\n`;
  if (Buffer.byteLength(bytes) < 2 || Buffer.byteLength(bytes) > 50_000_000) {
    throw new Error("The live source evidence artifact has an invalid size.");
  }
  let descriptor: number | undefined;
  try {
    descriptor = openSync(
      artifactPath,
      fsConstants.O_WRONLY |
        fsConstants.O_CREAT |
        fsConstants.O_EXCL |
        fsConstants.O_NOFOLLOW,
      0o600,
    );
    writeFileSync(descriptor, bytes, { encoding: "utf8" });
    fsyncSync(descriptor);
  } catch {
    throw new Error(
      "The live source evidence artifact could not be created exactly once inside RUNNER_TEMP.",
    );
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  const artifact = lstatSync(artifactPath);
  if (
    !artifact.isFile() ||
    artifact.isSymbolicLink() ||
    (artifact.mode & 0o077) !== 0 ||
    artifact.size !== Buffer.byteLength(bytes) ||
    realpathSync(artifactPath) !== artifactPath
  ) {
    throw new Error(
      "The live source evidence artifact is not exact and private.",
    );
  }
  return {
    byteLength: artifact.size,
    path: artifactPath,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function requestNeonApi(
  url: string,
  apiKey: string,
  fetchImplementation: typeof fetch,
  method: "GET" | "POST" = "GET",
): Promise<Record<string, unknown>> {
  if (!apiKey.trim() || apiKey.length > 4_096) {
    throw new Error(`${ADOPTION_ENV.neonApiKey} has an invalid format.`);
  }
  let response: Response;
  try {
    response = await fetchImplementation(url, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      redirect: "error",
      signal: AbortSignal.timeout(method === "POST" ? 30_000 : 20_000),
    });
  } catch {
    if (method === "POST") {
      throw new Error(
        "Neon snapshot creation had an ambiguous transport outcome; do not retry this run.",
      );
    }
    throw new Error("Neon provider identity verification could not connect.");
  }
  if (response.status !== 200) {
    throw new Error(
      `${method === "POST" ? "Neon snapshot creation" : "Neon provider identity verification"} returned HTTP ${response.status}.`,
    );
  }
  const body = await response.text();
  if (body.length > 5_000_000) {
    throw new Error("Neon provider response was unexpectedly large.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error("Neon provider response was not JSON.");
  }
  const record = asRecord(parsed);
  if (!record) throw new Error("Neon provider response was malformed.");
  return record;
}

function exactSnapshotFromList(
  snapshotsResponse: Record<string, unknown>,
  configuration: AdoptionConfiguration,
  expected: Pick<NeonRecoverySnapshotEvidence, "id" | "name">,
): NeonRecoverySnapshotEvidence {
  const snapshots = Array.isArray(snapshotsResponse.snapshots)
    ? snapshotsResponse.snapshots.map(asRecord).filter(Boolean)
    : [];
  const matchingSnapshots = snapshots.filter(
    (snapshot) =>
      snapshot?.id === expected.id &&
      snapshot.name === expected.name &&
      snapshot.source_branch_id === configuration.expectedBranchId &&
      snapshot.manual === true,
  );
  if (matchingSnapshots.length !== 1) {
    throw new Error(
      "Neon did not confirm the exact retained manual production snapshot.",
    );
  }
  const snapshot = matchingSnapshots[0]!;
  const exactSnapshotKeys = [
    "created_at",
    "full_size",
    "id",
    "manual",
    "name",
    "source_branch_id",
  ].sort();
  if (Object.keys(snapshot).sort().join(",") !== exactSnapshotKeys.join(",")) {
    throw new Error(
      "Neon snapshot evidence contains an unapproved or unverifiable field set.",
    );
  }
  const createdAt = snapshot.created_at;
  const fullSize = snapshot.full_size;
  if (
    typeof createdAt !== "string" ||
    !Number.isFinite(Date.parse(createdAt)) ||
    typeof fullSize !== "number" ||
    !Number.isSafeInteger(fullSize) ||
    fullSize < 0
  ) {
    throw new Error("Neon snapshot metadata is malformed.");
  }
  return {
    createdAt: new Date(Date.parse(createdAt)).toISOString(),
    fullSize: String(fullSize),
    id: expected.id,
    manual: true,
    name: expected.name,
    sourceBranchId: configuration.expectedBranchId,
  };
}

export async function verifyNeonProviderIdentity(
  configuration: AdoptionConfiguration,
  apiKey: string,
  fetchImplementation: typeof fetch = fetch,
  expectedSnapshot?: NeonRecoverySnapshotEvidence,
): Promise<void> {
  const base = `https://console.neon.tech/api/v2/projects/${configuration.expectedProjectId}`;
  const requests = [
    requestNeonApi(
      `${base}/branches/${configuration.expectedBranchId}`,
      apiKey,
      fetchImplementation,
    ),
    requestNeonApi(
      `${base}/branches/${configuration.expectedBranchId}/endpoints`,
      apiKey,
      fetchImplementation,
    ),
  ];
  if (expectedSnapshot) {
    requests.push(
      requestNeonApi(`${base}/snapshots`, apiKey, fetchImplementation),
    );
  }

  const [branchResponse, endpointsResponse, snapshotsResponse] =
    await Promise.all(requests);
  const branch = asRecord(branchResponse.branch);
  if (
    branch?.id !== configuration.expectedBranchId ||
    branch.project_id !== configuration.expectedProjectId ||
    branch.default !== true ||
    branch.protected !== true ||
    branch.current_state !== "ready" ||
    (branch.pending_state !== null && branch.pending_state !== undefined) ||
    (branch.parent_id !== null && branch.parent_id !== undefined)
  ) {
    throw new Error(
      "Neon did not confirm the expected protected default root production branch.",
    );
  }

  const endpoints = Array.isArray(endpointsResponse.endpoints)
    ? endpointsResponse.endpoints.map(asRecord).filter(Boolean)
    : [];
  const matchingEndpoints = endpoints.filter(
    (endpoint) =>
      endpoint?.branch_id === configuration.expectedBranchId &&
      endpoint.project_id === configuration.expectedProjectId &&
      endpoint.type === "read_write" &&
      endpoint.host === configuration.expectedHost &&
      endpoint.disabled === false &&
      (endpoint.current_state === "active" ||
        endpoint.current_state === "idle") &&
      (endpoint.pending_state === null || endpoint.pending_state === undefined),
  );
  if (matchingEndpoints.length !== 1) {
    throw new Error(
      "Neon did not bind the approved direct host to the expected production branch.",
    );
  }

  if (expectedSnapshot) {
    if (!snapshotsResponse) {
      throw new Error("Neon snapshot verification response is missing.");
    }
    const actual = exactSnapshotFromList(
      snapshotsResponse,
      configuration,
      expectedSnapshot,
    );
    if (
      actual.createdAt !== expectedSnapshot.createdAt ||
      actual.fullSize !== expectedSnapshot.fullSize ||
      actual.sourceBranchId !== expectedSnapshot.sourceBranchId
    ) {
      throw new Error("Neon snapshot metadata changed after creation.");
    }
  }
}

export async function createNeonRecoverySnapshotUnderWriteFreeze(
  configuration: AdoptionConfiguration,
  apiKey: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<NeonRecoverySnapshotEvidence> {
  const base = `https://console.neon.tech/api/v2/projects/${configuration.expectedProjectId}`;
  const createUrl =
    `${base}/branches/${configuration.expectedBranchId}/snapshot?name=` +
    encodeURIComponent(configuration.snapshotName);
  const created = await requestNeonApi(
    createUrl,
    apiKey,
    fetchImplementation,
    "POST",
  );
  const snapshot = asRecord(created.snapshot);
  if (
    snapshot?.name !== configuration.snapshotName ||
    snapshot.source_branch_id !== configuration.expectedBranchId ||
    snapshot.manual !== true ||
    typeof snapshot.id !== "string" ||
    !/^snap-[A-Za-z0-9-]{3,100}$/.test(snapshot.id)
  ) {
    throw new Error("Neon snapshot creation response was not exact.");
  }
  if (!Array.isArray(created.operations)) {
    throw new Error("Neon snapshot creation omitted operation evidence.");
  }
  const operations = created.operations.map((value) => {
    const operation = asRecord(value);
    if (
      typeof operation?.id !== "string" ||
      !/^[A-Za-z0-9_-]{3,160}$/.test(operation.id)
    ) {
      throw new Error("Neon returned malformed snapshot operation evidence.");
    }
    return operation.id;
  });
  await Promise.all(
    operations.map(async (operationId) => {
      for (let attempt = 0; attempt < 60; attempt += 1) {
        const response = await requestNeonApi(
          `${base}/operations/${operationId}`,
          apiKey,
          fetchImplementation,
        );
        const operation = asRecord(response.operation);
        const status = operation?.status;
        if (status === "finished" || status === "skipped") return;
        if (
          status === "failed" ||
          status === "cancelled" ||
          status === "cancelling"
        ) {
          throw new Error(
            `Neon snapshot operation entered terminal state ${status}.`,
          );
        }
        if (status !== "scheduling" && status !== "running") {
          throw new Error("Neon snapshot operation returned an unknown state.");
        }
        await new Promise<void>((resolveDelay) =>
          setTimeout(resolveDelay, 5_000),
        );
      }
      throw new Error("Timed out waiting for the Neon snapshot operation.");
    }),
  );
  const snapshots = await requestNeonApi(
    `${base}/snapshots`,
    apiKey,
    fetchImplementation,
  );
  return exactSnapshotFromList(snapshots, configuration, {
    id: snapshot.id,
    name: configuration.snapshotName,
  });
}

export async function verifyGitHubProtectedMain(
  configuration: AdoptionConfiguration,
  githubToken: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<void> {
  if (!githubToken.trim() || githubToken.length > 4_096) {
    throw new Error("GITHUB_TOKEN has an invalid format.");
  }
  const runId = configuration.githubRunUrl.split("/").at(-1);
  if (!runId || !/^[1-9][0-9]{2,30}$/.test(runId)) {
    throw new Error("The approved GitHub Actions run ID is invalid.");
  }
  const base = `https://api.github.com/repos/${configuration.githubRepository}`;
  const get = async (path: string): Promise<Record<string, unknown>> => {
    let response: Response;
    try {
      response = await fetchImplementation(`${base}${path}`, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${githubToken}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new Error("GitHub protected-main verification could not connect.");
    }
    if (response.status !== 200) {
      throw new Error(
        `GitHub protected-main verification returned HTTP ${response.status}.`,
      );
    }
    const body = await response.text();
    if (body.length > 5_000_000) {
      throw new Error("GitHub protected-main response was unexpectedly large.");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new Error("GitHub protected-main response was not JSON.");
    }
    const record = asRecord(parsed);
    if (!record) {
      throw new Error("GitHub protected-main response was malformed.");
    }
    return record;
  };
  const [branch, run] = await Promise.all([
    get("/branches/main"),
    get(`/actions/runs/${runId}`),
  ]);
  const branchCommit = asRecord(branch.commit);
  const actor = asRecord(run.actor);
  const triggeringActor = asRecord(run.triggering_actor);
  if (
    branch.name !== "main" ||
    branch.protected !== true ||
    branchCommit?.sha !== configuration.githubCommitSha
  ) {
    throw new Error(
      "GitHub no longer confirms the approved commit as protected main.",
    );
  }
  if (
    String(run.id) !== runId ||
    run.event !== "workflow_dispatch" ||
    run.run_attempt !== 1 ||
    run.status !== "in_progress" ||
    run.path !== ".github/workflows/adopt-legacy-production.yml" ||
    run.head_branch !== "main" ||
    run.head_sha !== configuration.githubCommitSha ||
    actor?.login !== configuration.approvedBy ||
    triggeringActor?.login !== configuration.approvedBy
  ) {
    throw new Error(
      "GitHub no longer confirms the approved one-time workflow run.",
    );
  }
}

function normalizeLedgerRows(rows: readonly LedgerRow[]) {
  return rows
    .map((row) => ({
      createdAt: String(row.created_at),
      hash: typeof row.hash === "string" ? row.hash : "",
    }))
    .sort((left, right) => {
      if (left.createdAt === right.createdAt) {
        return left.hash < right.hash ? -1 : left.hash > right.hash ? 1 : 0;
      }
      if (!/^\d+$/.test(left.createdAt) || !/^\d+$/.test(right.createdAt)) {
        return left.createdAt < right.createdAt ? -1 : 1;
      }
      return BigInt(left.createdAt) < BigInt(right.createdAt) ? -1 : 1;
    });
}

export function assertExactLegacyLedger(rows: readonly LedgerRow[]): void {
  const actual = normalizeLedgerRows(rows);
  if (actual.length !== EXACT_LEGACY_LEDGER.length) {
    throw new Error(
      `Legacy ledger must contain exactly ${EXACT_LEGACY_LEDGER.length} immutable rows.`,
    );
  }
  for (let index = 0; index < EXACT_LEGACY_LEDGER.length; index += 1) {
    const expected = EXACT_LEGACY_LEDGER[index];
    const row = actual[index];
    if (row.createdAt !== expected.createdAt || row.hash !== expected.hash) {
      throw new Error(`Legacy ledger differs at immutable entry ${index}.`);
    }
  }
}

export function resolveCurrentBaseline() {
  if (
    EXPECTED_DATABASE_MIGRATIONS.length !==
      EXACT_ADOPTION_MIGRATION_CHAIN.length ||
    EXPECTED_DATABASE_MIGRATIONS.some((migration, index) => {
      const exact = EXACT_ADOPTION_MIGRATION_CHAIN[index];
      return (
        migration.tag !== exact.tag ||
        migration.createdAt !== exact.createdAt ||
        migration.hash !== exact.hash
      );
    })
  ) {
    throw new Error(
      "The generated manifest is not the exact reviewed 0000+0001 adoption chain.",
    );
  }
  const baseline = EXPECTED_DATABASE_MIGRATIONS[0];
  const pending = EXPECTED_DATABASE_MIGRATIONS[1];
  return { baseline, pending };
}

type TenantContextKeyContractEntry = {
  keyId: string;
  secretSha256: string;
};

type TenantContextKeyContract = {
  preview: TenantContextKeyContractEntry;
  production: TenantContextKeyContractEntry;
  version: 1;
};

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value).sort();
  const exact = [...expected].sort();
  return (
    keys.length === exact.length &&
    keys.every((key, index) => key === exact[index])
  );
}

function parseTenantContextKeyContract(
  value: unknown,
): TenantContextKeyContract {
  const contract = asRecord(value);
  const production = asRecord(contract?.production);
  const preview = asRecord(contract?.preview);
  if (
    !contract ||
    !production ||
    !preview ||
    !hasExactKeys(contract, ["preview", "production", "version"]) ||
    !hasExactKeys(production, ["keyId", "secretSha256"]) ||
    !hasExactKeys(preview, ["keyId", "secretSha256"]) ||
    contract.version !== 1 ||
    typeof production.keyId !== "string" ||
    !/^[a-z0-9][a-z0-9._-]{0,31}$/.test(production.keyId) ||
    typeof preview.keyId !== "string" ||
    !/^[a-z0-9][a-z0-9._-]{0,31}$/.test(preview.keyId) ||
    typeof production.secretSha256 !== "string" ||
    !SHA256_PATTERN.test(production.secretSha256) ||
    typeof preview.secretSha256 !== "string" ||
    !SHA256_PATTERN.test(preview.secretSha256) ||
    production.keyId === preview.keyId ||
    production.secretSha256 === preview.secretSha256
  ) {
    throw new Error("The tracked tenant-context key contract is not exact.");
  }
  return {
    preview: {
      keyId: preview.keyId,
      secretSha256: preview.secretSha256,
    },
    production: {
      keyId: production.keyId,
      secretSha256: production.secretSha256,
    },
    version: 1,
  };
}

export function assertTenantContextCredentialContract(input: {
  contract: unknown;
  expectedKeyId: string;
  expectedSecretSha256: string;
  signingSecret: string;
}): void {
  const contract = parseTenantContextKeyContract(input.contract);
  if (
    !/^[a-z0-9][a-z0-9._-]{0,31}$/.test(input.expectedKeyId) ||
    !SHA256_PATTERN.test(input.expectedSecretSha256) ||
    !/^[A-Za-z0-9_-]{43,128}$/.test(input.signingSecret) ||
    input.signingSecret !== input.signingSecret.trim() ||
    contract.production.keyId !== input.expectedKeyId ||
    contract.production.secretSha256 !== input.expectedSecretSha256 ||
    createHash("sha256").update(input.signingSecret, "utf8").digest("hex") !==
      input.expectedSecretSha256
  ) {
    throw new Error(
      "The protected production tenant-context credential does not match the tracked contract.",
    );
  }
}

export function assertExactTransitionInputContents(input: {
  deploymentMigrationsSource: Buffer | string;
  tenantContextKeyContract: Buffer | string;
  tenantRlsSql: Buffer | string;
}): void {
  if (
    createHash("sha256")
      .update(input.deploymentMigrationsSource)
      .digest("hex") !== EXACT_DEPLOYMENT_MIGRATIONS_SHA256
  ) {
    throw new Error("The reviewed deployment migrator source has changed.");
  }
  if (
    createHash("sha256")
      .update(input.tenantContextKeyContract)
      .digest("hex") !== EXACT_TENANT_CONTEXT_KEY_CONTRACT_SHA256
  ) {
    throw new Error("The reviewed tenant-context key contract has changed.");
  }
  if (
    createHash("sha256").update(input.tenantRlsSql).digest("hex") !==
    EXACT_TENANT_RLS_SHA256
  ) {
    throw new Error("The reviewed tenant-RLS SQL has changed.");
  }
}

export function assertExactAdoptionFileContents(input: {
  deploymentMigrationsSource: Buffer | string;
  journal: unknown;
  sqlByTag: Readonly<Record<string, Buffer | string>>;
  tenantContextKeyContract: Buffer | string;
  tenantRlsSql: Buffer | string;
}): void {
  const expectedJournal = {
    version: "7",
    dialect: "postgresql",
    entries: EXACT_ADOPTION_MIGRATION_CHAIN.map((migration, index) => ({
      idx: index,
      version: "7",
      when: Number(migration.createdAt),
      tag: migration.tag,
      breakpoints: true,
    })),
  };
  if (
    canonicalJson(input.journal as JsonValue) !==
    canonicalJson(expectedJournal as JsonValue)
  ) {
    throw new Error("The on-disk Drizzle journal is not the reviewed chain.");
  }
  for (const migration of EXACT_ADOPTION_MIGRATION_CHAIN) {
    const contents = input.sqlByTag[migration.tag];
    if (contents === undefined) {
      throw new Error(`Reviewed SQL file ${migration.tag} is missing.`);
    }
    const hash = createHash("sha256").update(contents).digest("hex");
    if (hash !== migration.hash) {
      throw new Error(`Reviewed SQL file ${migration.tag} has changed.`);
    }
  }
  if (
    Object.keys(input.sqlByTag).sort().join(",") !==
    EXACT_ADOPTION_MIGRATION_CHAIN.map((migration) => migration.tag)
      .sort()
      .join(",")
  ) {
    throw new Error("The reviewed SQL input set is not exact.");
  }
  assertExactTransitionInputContents(input);
}

export function assertExactAdoptionFiles(
  workspaceValue: string,
  configuration?: Pick<
    AdoptionConfiguration,
    "expectedTenantContextKeyId" | "expectedTenantContextSecretSha256"
  >,
  environment?: NodeJS.ProcessEnv,
): void {
  let workspace: string;
  try {
    workspace = realpathSync(resolve(workspaceValue));
  } catch {
    throw new Error("GITHUB_WORKSPACE is not an inspectable repository path.");
  }
  const readRepoFile = (relativePath: string): Buffer => {
    const requestedPath = resolve(workspace, relativePath);
    if (!requestedPath.startsWith(`${workspace}${sep}`)) {
      throw new Error("Reviewed migration path escaped GITHUB_WORKSPACE.");
    }
    try {
      const stats = lstatSync(requestedPath);
      if (
        !stats.isFile() ||
        stats.isSymbolicLink() ||
        stats.size > 10_000_000
      ) {
        throw new Error("not an exact regular file");
      }
      const realPath = realpathSync(requestedPath);
      if (!realPath.startsWith(`${workspace}${sep}`)) {
        throw new Error("resolved outside workspace");
      }
      return readFileSync(realPath);
    } catch {
      throw new Error(`Reviewed repository file ${relativePath} is invalid.`);
    }
  };
  let journal: unknown;
  try {
    journal = JSON.parse(
      readRepoFile("apps/web/drizzle/meta/_journal.json").toString("utf8"),
    );
  } catch {
    throw new Error("The on-disk Drizzle journal is not valid JSON.");
  }
  const tenantContextKeyContract = readRepoFile(
    ".github/tenant-context-key-contract.json",
  );
  assertExactAdoptionFileContents({
    deploymentMigrationsSource: readRepoFile(
      "apps/web/scripts/deployment-migrations.ts",
    ),
    journal,
    sqlByTag: Object.fromEntries(
      EXACT_ADOPTION_MIGRATION_CHAIN.map((migration) => [
        migration.tag,
        readRepoFile(`apps/web/drizzle/${migration.tag}.sql`),
      ]),
    ),
    tenantContextKeyContract,
    tenantRlsSql: readRepoFile("packages/api/src/db/migrations/tenant-rls.sql"),
  });
  if (configuration || environment) {
    if (!configuration || !environment) {
      throw new Error("Tenant-context credential verification is incomplete.");
    }
    const signingSecret = environment[ADOPTION_ENV.tenantContextSigningSecret];
    if (typeof signingSecret !== "string") {
      throw new Error(
        "The protected production tenant-context credential is unavailable.",
      );
    }
    let contract: unknown;
    try {
      contract = JSON.parse(tenantContextKeyContract.toString("utf8"));
    } catch {
      throw new Error("The tracked tenant-context key contract is not JSON.");
    }
    assertTenantContextCredentialContract({
      contract,
      expectedKeyId: configuration.expectedTenantContextKeyId,
      expectedSecretSha256: configuration.expectedTenantContextSecretSha256,
      signingSecret,
    });
  }
}

function integer(value: unknown, label: string): number {
  const normalized = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw new Error(`${label} was not a non-negative integer.`);
  }
  return normalized;
}

const ADOPTION_ROLE_MEMBERSHIP_EDGE_KEYS = [
  "admin_option",
  "granted_role",
  "grantor_role",
  "inherit_option",
  "member_role",
  "set_option",
] as const;

function hasExactRoleMembershipEdgeShape(
  value: unknown,
): value is AdoptionRoleMembershipEdge {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const edge = value as Record<string, unknown>;
  const keys = Object.keys(edge).sort();
  return (
    keys.length === ADOPTION_ROLE_MEMBERSHIP_EDGE_KEYS.length &&
    keys.every(
      (key, index) => key === ADOPTION_ROLE_MEMBERSHIP_EDGE_KEYS[index],
    ) &&
    typeof edge.member_role === "string" &&
    typeof edge.granted_role === "string" &&
    typeof edge.grantor_role === "string" &&
    typeof edge.admin_option === "boolean" &&
    typeof edge.inherit_option === "boolean" &&
    typeof edge.set_option === "boolean"
  );
}

function roleMembershipEdges(
  value: unknown,
  label: string,
): AdoptionRoleMembershipEdge[] {
  if (!Array.isArray(value) || !value.every(hasExactRoleMembershipEdgeShape)) {
    throw new Error(`${label} role membership evidence was malformed.`);
  }
  return value;
}

export function assertAdoptionRoleMembershipsAreSafe(
  memberships: readonly AdoptionRoleMembershipEdge[],
  migrationOwner: string,
  serviceRole: string,
  label: string,
): void {
  const permittedProviderManagementEdge = (
    edge: AdoptionRoleMembershipEdge,
  ): boolean =>
    hasExactRoleMembershipEdgeShape(edge) &&
    edge.member_role === migrationOwner &&
    edge.granted_role === serviceRole &&
    edge.grantor_role.trim().length > 0 &&
    edge.admin_option === true &&
    edge.inherit_option === false &&
    edge.set_option === false;
  if (
    !Array.isArray(memberships) ||
    memberships.length > 1 ||
    !memberships.every(permittedProviderManagementEdge)
  ) {
    throw new Error(`${label} role membership contract is unsafe.`);
  }
}

async function readIdentity(client: SqlClient): Promise<AdoptionIdentity> {
  const result = await client.query<{
    branch_id: string | null;
    database_name: string;
    ledger_owner: string | null;
    migration_owner_can_signal_backends: boolean;
    project_id: string | null;
    role_name: string;
    role_bypasses_rls: boolean;
    session_role: string;
  }>(`
    SELECT
      current_database() AS database_name,
      current_user AS role_name,
      session_user AS session_role,
      current_setting('neon.project_id', true) AS project_id,
      current_setting('neon.branch_id', true) AS branch_id,
      pg_catalog.pg_get_userbyid(ledger.relowner) AS ledger_owner,
      pg_catalog.pg_has_role(
        current_user,
        'pg_signal_backend',
        'USAGE'
      ) AS migration_owner_can_signal_backends,
      roles.rolbypassrls OR roles.rolsuper AS role_bypasses_rls
    FROM pg_catalog.pg_class ledger
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = ledger.relnamespace
    JOIN pg_catalog.pg_roles roles ON roles.rolname = current_user
    WHERE namespace.nspname = 'drizzle'
      AND ledger.relname = '__drizzle_migrations'
      AND ledger.relkind = 'r'
  `);
  if (result.rows.length !== 1) {
    throw new Error("The exact Drizzle migration ledger table was not found.");
  }
  const row = result.rows[0];
  return {
    branchIdSetting: row.branch_id || null,
    database: row.database_name,
    ledgerOwner: row.ledger_owner || "",
    migrationOwnerCanSignalBackends: row.migration_owner_can_signal_backends,
    projectIdSetting: row.project_id || null,
    role: row.role_name,
    roleBypassesRls: row.role_bypasses_rls,
    sessionRole: row.session_role,
  };
}

export async function assertMigrationOwnerCanSignalBackends(
  client: SqlClient,
): Promise<void> {
  const result = await client.query<{
    migration_owner_can_signal_backends: boolean;
  }>(`
    SELECT pg_catalog.pg_has_role(
      current_user,
      'pg_signal_backend',
      'USAGE'
    ) AS migration_owner_can_signal_backends
  `);
  if (
    result.rows.length !== 1 ||
    result.rows[0]?.migration_owner_can_signal_backends !== true
  ) {
    throw new Error(
      "The migration owner cannot signal application backends for the follow-on signed-context release.",
    );
  }
}

export function assertLedgerTableContract(
  contract: LedgerTableContract,
  expectedOwner: string,
  expectedRuntimeRole: string,
  expectedPlatformRole: string,
): void {
  assertAdoptionRoleMembershipsAreSafe(
    contract.runtimeRoleMemberships,
    expectedOwner,
    expectedRuntimeRole,
    "runtime",
  );
  assertAdoptionRoleMembershipsAreSafe(
    contract.platformRoleMemberships,
    expectedOwner,
    expectedPlatformRole,
    "platform",
  );
  const exactColumns = [
    "1:id:integer:true:false:false:nextval('drizzle.__drizzle_migrations_id_seq'::regclass)",
    "2:hash:text:true:false:false:<none>",
    "3:created_at:bigint:false:false:false:<none>",
  ];
  const sequencePositionIsSafe =
    Number.isSafeInteger(contract.maximumLedgerId) &&
    contract.maximumLedgerId > 0 &&
    /^[0-9]+$/.test(contract.sequenceLastValue) &&
    contract.sequenceLastValue === "16" &&
    BigInt(contract.sequenceLastValue) >= BigInt(contract.maximumLedgerId) &&
    BigInt(contract.sequenceMaxValue) - BigInt(contract.sequenceLastValue) >=
      BigInt(
        EXACT_ADOPTION_MIGRATION_CHAIN.length -
          1 +
          MINIMUM_LEDGER_SEQUENCE_RESERVE,
      );
  const expectedSchemaAcl = [
    `${expectedOwner}:${expectedOwner}:CREATE:false`,
    `${expectedOwner}:${expectedOwner}:USAGE:false`,
    `${expectedPlatformRole}:${expectedOwner}:USAGE:false`,
    `${expectedRuntimeRole}:${expectedOwner}:USAGE:false`,
  ].sort();
  const expectedTableAcl = [
    `${expectedOwner}:${expectedOwner}:DELETE:false`,
    `${expectedOwner}:${expectedOwner}:INSERT:false`,
    `${expectedOwner}:${expectedOwner}:REFERENCES:false`,
    `${expectedOwner}:${expectedOwner}:SELECT:false`,
    `${expectedOwner}:${expectedOwner}:TRIGGER:false`,
    `${expectedOwner}:${expectedOwner}:TRUNCATE:false`,
    `${expectedOwner}:${expectedOwner}:UPDATE:false`,
    `${expectedPlatformRole}:${expectedOwner}:SELECT:false`,
    `${expectedRuntimeRole}:${expectedOwner}:SELECT:false`,
    ...(contract.serverVersionNumber >= 170_000
      ? [`${expectedOwner}:${expectedOwner}:MAINTAIN:false`]
      : []),
  ].sort();
  const expectedSequenceAcl = [
    `${expectedOwner}:${expectedOwner}:SELECT:false`,
    `${expectedOwner}:${expectedOwner}:UPDATE:false`,
    `${expectedOwner}:${expectedOwner}:USAGE:false`,
  ].sort();
  const exactAcl = (actual: readonly string[], expected: readonly string[]) =>
    actual.length === expected.length &&
    [...actual].sort().every((entry, index) => entry === expected[index]);
  if (
    contract.relationKind !== "r" ||
    contract.persistence !== "p" ||
    contract.rls ||
    contract.forceRls ||
    contract.columnContract.length !== exactColumns.length ||
    contract.columnContract.some(
      (column, index) => column !== exactColumns[index],
    ) ||
    contract.serialSequence !== "drizzle.__drizzle_migrations_id_seq" ||
    contract.constraintCount !== 1 ||
    contract.primaryConstraintCount !== 1 ||
    contract.primaryConstraintDefinition !== "PRIMARY KEY (id)" ||
    contract.indexCount !== 1 ||
    contract.primaryIndexCount !== 1 ||
    contract.primaryIndexDefinition !==
      "CREATE UNIQUE INDEX __drizzle_migrations_pkey ON drizzle.__drizzle_migrations USING btree (id)" ||
    contract.incomingForeignKeyCount !== 0 ||
    contract.publicationCount !== 0 ||
    contract.sequencePersistence !== "p" ||
    contract.serverVersionNumber < 160_000 ||
    contract.sequenceDataType !== "integer" ||
    contract.sequenceStartValue !== "1" ||
    contract.sequenceMinValue !== "1" ||
    contract.sequenceMaxValue !== "2147483647" ||
    contract.sequenceIncrement !== "1" ||
    contract.sequenceCacheSize !== "1" ||
    contract.sequenceCycle ||
    !contract.sequenceIsCalled ||
    !contract.sequenceOwnerMatchesLedger ||
    !sequencePositionIsSafe ||
    contract.nonInternalTriggerCount !== 0 ||
    contract.totalTriggerCount !== 0 ||
    contract.ruleCount !== 0 ||
    contract.policyCount !== 0 ||
    contract.inheritanceCount !== 0 ||
    contract.schemaOwner !== expectedOwner ||
    contract.tableOwner !== expectedOwner ||
    contract.sequenceOwner !== expectedOwner ||
    contract.tableColumnAclCount !== 0 ||
    contract.runtimeRoleName !== expectedRuntimeRole ||
    !contract.runtimeCanLogin ||
    contract.runtimeSuperuser ||
    contract.runtimeBypassesRls ||
    contract.runtimeCanCreateCurrentDatabase ||
    contract.runtimeCanCreateRole ||
    contract.runtimeCanCreateDatabase ||
    contract.runtimeReplication ||
    contract.runtimeRoleConfig.length !== 0 ||
    contract.runtimeRoleDatabaseSettingCount !== 0 ||
    contract.runtimeOwnsDatabase ||
    contract.runtimeOwnedObjectCount !== 0 ||
    !exactAcl(contract.runtimeDrizzleSchemaPrivileges, ["USAGE"]) ||
    !exactAcl(contract.runtimeLedgerPrivileges, ["SELECT"]) ||
    contract.runtimeSequencePrivileges.length !== 0 ||
    contract.platformRoleName !== expectedPlatformRole ||
    !contract.platformCanLogin ||
    contract.platformSuperuser ||
    contract.platformBypassesRls ||
    contract.platformCanCreateCurrentDatabase ||
    contract.platformCanCreateRole ||
    contract.platformCanCreateDatabase ||
    contract.platformReplication ||
    contract.platformRoleConfig.length !== 0 ||
    contract.platformRoleDatabaseSettingCount !== 0 ||
    contract.platformOwnsDatabase ||
    contract.platformOwnedObjectCount !== 0 ||
    !exactAcl(contract.platformDrizzleSchemaPrivileges, ["USAGE"]) ||
    !exactAcl(contract.platformLedgerPrivileges, ["SELECT"]) ||
    contract.platformSequencePrivileges.length !== 0 ||
    !exactAcl(contract.schemaAcl, expectedSchemaAcl) ||
    !exactAcl(contract.tableAcl, expectedTableAcl) ||
    !exactAcl(contract.sequenceAcl, expectedSequenceAcl)
  ) {
    throw new Error(
      "The Drizzle ledger table contract is not exact and inert.",
    );
  }
}

export async function assertLiveLedgerTableContract(
  client: SqlClient,
  expectedOwner: string,
  expectedRuntimeRole: string,
  expectedPlatformRole: string,
): Promise<void> {
  const columns = await client.query<{
    default_expression: string | null;
    generated: string;
    identity_kind: string;
    name: string;
    not_null: boolean;
    position: unknown;
    type_name: string;
  }>(`
    SELECT
      attributes.attnum AS position,
      attributes.attname AS name,
      pg_catalog.format_type(attributes.atttypid, attributes.atttypmod) AS type_name,
      attributes.attnotnull AS not_null,
      attributes.attidentity::text AS identity_kind,
      attributes.attgenerated::text AS generated,
      pg_catalog.pg_get_expr(
        defaults.adbin,
        defaults.adrelid,
        false
      ) AS default_expression
    FROM pg_catalog.pg_attribute attributes
    JOIN pg_catalog.pg_class ledger ON ledger.oid = attributes.attrelid
    JOIN pg_catalog.pg_namespace namespaces ON namespaces.oid = ledger.relnamespace
    LEFT JOIN pg_catalog.pg_attrdef defaults
      ON defaults.adrelid = attributes.attrelid
     AND defaults.adnum = attributes.attnum
    WHERE namespaces.nspname = 'drizzle'
      AND ledger.relname = '__drizzle_migrations'
      AND attributes.attnum > 0
      AND NOT attributes.attisdropped
    ORDER BY attributes.attnum
  `);
  const result = await client.query<{
    constraint_count: unknown;
    force_rls: boolean;
    index_count: unknown;
    incoming_foreign_key_count: unknown;
    inheritance_count: unknown;
    noninternal_trigger_count: unknown;
    persistence: string;
    platform_bypasses_rls: boolean;
    platform_can_create_current_database: boolean;
    platform_can_create_database: boolean;
    platform_can_create_role: boolean;
    platform_can_login: boolean;
    platform_drizzle_schema_privileges: string[];
    platform_ledger_privileges: string[];
    platform_role_memberships: unknown;
    platform_owned_object_count: unknown;
    platform_owns_database: boolean;
    platform_replication: boolean;
    platform_role_config: string[];
    platform_role_database_setting_count: unknown;
    platform_role_name: string;
    platform_sequence_privileges: string[];
    platform_superuser: boolean;
    policy_count: unknown;
    publication_count: unknown;
    primary_constraint_definition: string | null;
    primary_constraint_count: unknown;
    primary_index_definition: string | null;
    primary_index_count: unknown;
    relation_kind: string;
    rls: boolean;
    rule_count: unknown;
    runtime_bypasses_rls: boolean;
    runtime_can_create_current_database: boolean;
    runtime_can_create_database: boolean;
    runtime_can_create_role: boolean;
    runtime_can_login: boolean;
    runtime_drizzle_schema_privileges: string[];
    runtime_ledger_privileges: string[];
    runtime_role_memberships: unknown;
    runtime_owned_object_count: unknown;
    runtime_owns_database: boolean;
    runtime_replication: boolean;
    runtime_role_config: string[];
    runtime_role_database_setting_count: unknown;
    runtime_role_name: string;
    runtime_sequence_privileges: string[];
    runtime_superuser: boolean;
    schema_acl: string[];
    schema_owner: string;
    server_version_number: unknown;
    sequence_acl: string[];
    sequence_cache_size: string;
    sequence_cycle: boolean;
    sequence_data_type: string;
    sequence_increment: string;
    sequence_is_called: boolean;
    sequence_last_value: string;
    sequence_max_value: string;
    sequence_min_value: string;
    sequence_owner: string;
    sequence_owner_matches_ledger: boolean;
    sequence_persistence: string;
    sequence_start_value: string;
    serial_sequence: string | null;
    table_acl: string[];
    table_column_acl_count: unknown;
    table_owner: string;
    total_trigger_count: unknown;
    maximum_ledger_id: unknown;
  }>(
    `
    SELECT
      ledger.relkind::text AS relation_kind,
      ledger.relpersistence::text AS persistence,
      ledger.relrowsecurity AS rls,
      ledger.relforcerowsecurity AS force_rls,
      current_setting('server_version_num')::integer AS server_version_number,
      runtime_role.rolname::text AS runtime_role_name,
      runtime_role.rolcanlogin AS runtime_can_login,
      runtime_role.rolsuper AS runtime_superuser,
      runtime_role.rolbypassrls AS runtime_bypasses_rls,
      runtime_role.rolcreaterole AS runtime_can_create_role,
      runtime_role.rolcreatedb AS runtime_can_create_database,
      runtime_role.rolreplication AS runtime_replication,
      pg_catalog.has_database_privilege(
        runtime_role.oid,
        current_database(),
        'CREATE'
      ) AS runtime_can_create_current_database,
      COALESCE(runtime_role.rolconfig, ARRAY[]::text[])
        AS runtime_role_config,
      (SELECT count(*)
       FROM pg_catalog.pg_db_role_setting settings
       WHERE settings.setrole = runtime_role.oid
          OR (
            settings.setrole = 0 AND (
              settings.setdatabase = 0 OR
              settings.setdatabase = (
                SELECT databases.oid
                FROM pg_catalog.pg_database databases
                WHERE databases.datname = current_database()
              )
            )
          ))
        AS runtime_role_database_setting_count,
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'member_role', member_roles.rolname::text,
            'granted_role', granted_roles.rolname::text,
            'grantor_role', grantor_roles.rolname::text,
            'admin_option', memberships.admin_option,
            'inherit_option', memberships.inherit_option,
            'set_option', memberships.set_option
          )
          ORDER BY
            member_roles.rolname,
            granted_roles.rolname,
            grantor_roles.rolname
        )
        FROM pg_catalog.pg_auth_members memberships
        JOIN pg_catalog.pg_roles member_roles
          ON member_roles.oid = memberships.member
        JOIN pg_catalog.pg_roles granted_roles
          ON granted_roles.oid = memberships.roleid
        JOIN pg_catalog.pg_roles grantor_roles
          ON grantor_roles.oid = memberships.grantor
        WHERE memberships.member = runtime_role.oid
           OR memberships.roleid = runtime_role.oid
      ), '[]'::jsonb) AS runtime_role_memberships,
      EXISTS (
        SELECT 1 FROM pg_catalog.pg_database databases
        WHERE databases.datname = current_database()
          AND databases.datdba = runtime_role.oid
      ) AS runtime_owns_database,
      ((SELECT count(*) FROM pg_catalog.pg_namespace owned_schemas
        WHERE owned_schemas.nspowner = runtime_role.oid
          AND owned_schemas.nspname <> 'information_schema'
          AND owned_schemas.nspname !~ '^pg_') +
       (SELECT count(*)
        FROM pg_catalog.pg_class owned_relations
        JOIN pg_catalog.pg_namespace owned_relation_schemas
          ON owned_relation_schemas.oid = owned_relations.relnamespace
        WHERE owned_relations.relowner = runtime_role.oid
          AND owned_relation_schemas.nspname <> 'information_schema'
          AND owned_relation_schemas.nspname !~ '^pg_') +
       (SELECT count(*)
        FROM pg_catalog.pg_proc owned_functions
        JOIN pg_catalog.pg_namespace owned_function_schemas
          ON owned_function_schemas.oid = owned_functions.pronamespace
        WHERE owned_functions.proowner = runtime_role.oid
          AND owned_function_schemas.nspname <> 'information_schema'
          AND owned_function_schemas.nspname !~ '^pg_') +
       (SELECT count(*)
        FROM pg_catalog.pg_type owned_types
        JOIN pg_catalog.pg_namespace owned_type_schemas
          ON owned_type_schemas.oid = owned_types.typnamespace
        WHERE owned_types.typowner = runtime_role.oid
          AND owned_type_schemas.nspname <> 'information_schema'
          AND owned_type_schemas.nspname !~ '^pg_') +
       (SELECT count(*) FROM pg_catalog.pg_collation objects
        JOIN pg_catalog.pg_namespace object_schemas
          ON object_schemas.oid = objects.collnamespace
        WHERE objects.collowner = runtime_role.oid
          AND object_schemas.nspname <> 'information_schema'
          AND object_schemas.nspname !~ '^pg_') +
       (SELECT count(*) FROM pg_catalog.pg_conversion objects
        JOIN pg_catalog.pg_namespace object_schemas
          ON object_schemas.oid = objects.connamespace
        WHERE objects.conowner = runtime_role.oid
          AND object_schemas.nspname <> 'information_schema'
          AND object_schemas.nspname !~ '^pg_') +
       (SELECT count(*) FROM pg_catalog.pg_operator objects
        JOIN pg_catalog.pg_namespace object_schemas
          ON object_schemas.oid = objects.oprnamespace
        WHERE objects.oprowner = runtime_role.oid
          AND object_schemas.nspname <> 'information_schema'
          AND object_schemas.nspname !~ '^pg_') +
       (SELECT count(*) FROM pg_catalog.pg_opclass objects
        JOIN pg_catalog.pg_namespace object_schemas
          ON object_schemas.oid = objects.opcnamespace
        WHERE objects.opcowner = runtime_role.oid
          AND object_schemas.nspname <> 'information_schema'
          AND object_schemas.nspname !~ '^pg_') +
       (SELECT count(*) FROM pg_catalog.pg_opfamily objects
        JOIN pg_catalog.pg_namespace object_schemas
          ON object_schemas.oid = objects.opfnamespace
        WHERE objects.opfowner = runtime_role.oid
          AND object_schemas.nspname <> 'information_schema'
          AND object_schemas.nspname !~ '^pg_') +
       (SELECT count(*) FROM pg_catalog.pg_ts_config objects
        JOIN pg_catalog.pg_namespace object_schemas
          ON object_schemas.oid = objects.cfgnamespace
        WHERE objects.cfgowner = runtime_role.oid
          AND object_schemas.nspname <> 'information_schema'
          AND object_schemas.nspname !~ '^pg_') +
       (SELECT count(*) FROM pg_catalog.pg_ts_dict objects
        JOIN pg_catalog.pg_namespace object_schemas
          ON object_schemas.oid = objects.dictnamespace
        WHERE objects.dictowner = runtime_role.oid
          AND object_schemas.nspname <> 'information_schema'
          AND object_schemas.nspname !~ '^pg_') +
       (SELECT count(*) FROM pg_catalog.pg_statistic_ext objects
        JOIN pg_catalog.pg_namespace object_schemas
          ON object_schemas.oid = objects.stxnamespace
        WHERE objects.stxowner = runtime_role.oid
          AND object_schemas.nspname <> 'information_schema'
          AND object_schemas.nspname !~ '^pg_') +
       (SELECT count(*)
        FROM pg_catalog.pg_extension owned_extensions
        WHERE owned_extensions.extowner = runtime_role.oid) +
       (SELECT count(*) FROM pg_catalog.pg_database objects
        WHERE objects.datdba = runtime_role.oid) +
       (SELECT count(*) FROM pg_catalog.pg_tablespace objects
        WHERE objects.spcowner = runtime_role.oid) +
       (SELECT count(*) FROM pg_catalog.pg_language objects
        WHERE objects.lanowner = runtime_role.oid) +
       (SELECT count(*) FROM pg_catalog.pg_foreign_data_wrapper objects
        WHERE objects.fdwowner = runtime_role.oid) +
       (SELECT count(*) FROM pg_catalog.pg_foreign_server objects
        WHERE objects.srvowner = runtime_role.oid) +
       (SELECT count(*) FROM pg_catalog.pg_event_trigger objects
        WHERE objects.evtowner = runtime_role.oid) +
       (SELECT count(*) FROM pg_catalog.pg_publication objects
        WHERE objects.pubowner = runtime_role.oid) +
       (SELECT count(*) FROM pg_catalog.pg_subscription objects
        WHERE objects.subowner = runtime_role.oid) +
       (SELECT count(*) FROM pg_catalog.pg_largeobject_metadata objects
        WHERE objects.lomowner = runtime_role.oid) +
       (SELECT count(*) FROM pg_catalog.pg_default_acl objects
        WHERE objects.defaclrole = runtime_role.oid))
        AS runtime_owned_object_count,
      platform_role.rolname::text AS platform_role_name,
      platform_role.rolcanlogin AS platform_can_login,
      platform_role.rolsuper AS platform_superuser,
      platform_role.rolbypassrls AS platform_bypasses_rls,
      platform_role.rolcreaterole AS platform_can_create_role,
      platform_role.rolcreatedb AS platform_can_create_database,
      platform_role.rolreplication AS platform_replication,
      pg_catalog.has_database_privilege(
        platform_role.oid,
        current_database(),
        'CREATE'
      ) AS platform_can_create_current_database,
      COALESCE(platform_role.rolconfig, ARRAY[]::text[])
        AS platform_role_config,
      (SELECT count(*)
       FROM pg_catalog.pg_db_role_setting settings
       WHERE settings.setrole = platform_role.oid
          OR (
            settings.setrole = 0 AND (
              settings.setdatabase = 0 OR
              settings.setdatabase = (
                SELECT databases.oid
                FROM pg_catalog.pg_database databases
                WHERE databases.datname = current_database()
              )
            )
          ))
        AS platform_role_database_setting_count,
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'member_role', member_roles.rolname::text,
            'granted_role', granted_roles.rolname::text,
            'grantor_role', grantor_roles.rolname::text,
            'admin_option', memberships.admin_option,
            'inherit_option', memberships.inherit_option,
            'set_option', memberships.set_option
          )
          ORDER BY
            member_roles.rolname,
            granted_roles.rolname,
            grantor_roles.rolname
        )
        FROM pg_catalog.pg_auth_members memberships
        JOIN pg_catalog.pg_roles member_roles
          ON member_roles.oid = memberships.member
        JOIN pg_catalog.pg_roles granted_roles
          ON granted_roles.oid = memberships.roleid
        JOIN pg_catalog.pg_roles grantor_roles
          ON grantor_roles.oid = memberships.grantor
        WHERE memberships.member = platform_role.oid
           OR memberships.roleid = platform_role.oid
      ), '[]'::jsonb) AS platform_role_memberships,
      EXISTS (
        SELECT 1 FROM pg_catalog.pg_database databases
        WHERE databases.datname = current_database()
          AND databases.datdba = platform_role.oid
      ) AS platform_owns_database,
      ((SELECT count(*) FROM pg_catalog.pg_namespace owned_schemas
        WHERE owned_schemas.nspowner = platform_role.oid
          AND owned_schemas.nspname <> 'information_schema'
          AND owned_schemas.nspname !~ '^pg_') +
       (SELECT count(*)
        FROM pg_catalog.pg_class owned_relations
        JOIN pg_catalog.pg_namespace owned_relation_schemas
          ON owned_relation_schemas.oid = owned_relations.relnamespace
        WHERE owned_relations.relowner = platform_role.oid
          AND owned_relation_schemas.nspname <> 'information_schema'
          AND owned_relation_schemas.nspname !~ '^pg_') +
       (SELECT count(*)
        FROM pg_catalog.pg_proc owned_functions
        JOIN pg_catalog.pg_namespace owned_function_schemas
          ON owned_function_schemas.oid = owned_functions.pronamespace
        WHERE owned_functions.proowner = platform_role.oid
          AND owned_function_schemas.nspname <> 'information_schema'
          AND owned_function_schemas.nspname !~ '^pg_') +
       (SELECT count(*)
        FROM pg_catalog.pg_type owned_types
        JOIN pg_catalog.pg_namespace owned_type_schemas
          ON owned_type_schemas.oid = owned_types.typnamespace
        WHERE owned_types.typowner = platform_role.oid
          AND owned_type_schemas.nspname <> 'information_schema'
          AND owned_type_schemas.nspname !~ '^pg_') +
       (SELECT count(*) FROM pg_catalog.pg_collation objects
        JOIN pg_catalog.pg_namespace object_schemas
          ON object_schemas.oid = objects.collnamespace
        WHERE objects.collowner = platform_role.oid
          AND object_schemas.nspname <> 'information_schema'
          AND object_schemas.nspname !~ '^pg_') +
       (SELECT count(*) FROM pg_catalog.pg_conversion objects
        JOIN pg_catalog.pg_namespace object_schemas
          ON object_schemas.oid = objects.connamespace
        WHERE objects.conowner = platform_role.oid
          AND object_schemas.nspname <> 'information_schema'
          AND object_schemas.nspname !~ '^pg_') +
       (SELECT count(*) FROM pg_catalog.pg_operator objects
        JOIN pg_catalog.pg_namespace object_schemas
          ON object_schemas.oid = objects.oprnamespace
        WHERE objects.oprowner = platform_role.oid
          AND object_schemas.nspname <> 'information_schema'
          AND object_schemas.nspname !~ '^pg_') +
       (SELECT count(*) FROM pg_catalog.pg_opclass objects
        JOIN pg_catalog.pg_namespace object_schemas
          ON object_schemas.oid = objects.opcnamespace
        WHERE objects.opcowner = platform_role.oid
          AND object_schemas.nspname <> 'information_schema'
          AND object_schemas.nspname !~ '^pg_') +
       (SELECT count(*) FROM pg_catalog.pg_opfamily objects
        JOIN pg_catalog.pg_namespace object_schemas
          ON object_schemas.oid = objects.opfnamespace
        WHERE objects.opfowner = platform_role.oid
          AND object_schemas.nspname <> 'information_schema'
          AND object_schemas.nspname !~ '^pg_') +
       (SELECT count(*) FROM pg_catalog.pg_ts_config objects
        JOIN pg_catalog.pg_namespace object_schemas
          ON object_schemas.oid = objects.cfgnamespace
        WHERE objects.cfgowner = platform_role.oid
          AND object_schemas.nspname <> 'information_schema'
          AND object_schemas.nspname !~ '^pg_') +
       (SELECT count(*) FROM pg_catalog.pg_ts_dict objects
        JOIN pg_catalog.pg_namespace object_schemas
          ON object_schemas.oid = objects.dictnamespace
        WHERE objects.dictowner = platform_role.oid
          AND object_schemas.nspname <> 'information_schema'
          AND object_schemas.nspname !~ '^pg_') +
       (SELECT count(*) FROM pg_catalog.pg_statistic_ext objects
        JOIN pg_catalog.pg_namespace object_schemas
          ON object_schemas.oid = objects.stxnamespace
        WHERE objects.stxowner = platform_role.oid
          AND object_schemas.nspname <> 'information_schema'
          AND object_schemas.nspname !~ '^pg_') +
       (SELECT count(*)
        FROM pg_catalog.pg_extension owned_extensions
        WHERE owned_extensions.extowner = platform_role.oid) +
       (SELECT count(*) FROM pg_catalog.pg_database objects
        WHERE objects.datdba = platform_role.oid) +
       (SELECT count(*) FROM pg_catalog.pg_tablespace objects
        WHERE objects.spcowner = platform_role.oid) +
       (SELECT count(*) FROM pg_catalog.pg_language objects
        WHERE objects.lanowner = platform_role.oid) +
       (SELECT count(*) FROM pg_catalog.pg_foreign_data_wrapper objects
        WHERE objects.fdwowner = platform_role.oid) +
       (SELECT count(*) FROM pg_catalog.pg_foreign_server objects
        WHERE objects.srvowner = platform_role.oid) +
       (SELECT count(*) FROM pg_catalog.pg_event_trigger objects
        WHERE objects.evtowner = platform_role.oid) +
       (SELECT count(*) FROM pg_catalog.pg_publication objects
        WHERE objects.pubowner = platform_role.oid) +
       (SELECT count(*) FROM pg_catalog.pg_subscription objects
        WHERE objects.subowner = platform_role.oid) +
       (SELECT count(*) FROM pg_catalog.pg_largeobject_metadata objects
        WHERE objects.lomowner = platform_role.oid) +
       (SELECT count(*) FROM pg_catalog.pg_default_acl objects
        WHERE objects.defaclrole = platform_role.oid))
        AS platform_owned_object_count,
      ARRAY(
        SELECT privilege
        FROM unnest(ARRAY['CREATE', 'USAGE']::text[]) privilege
        WHERE pg_catalog.has_schema_privilege(
          runtime_role.oid,
          namespaces.oid,
          privilege
        )
        ORDER BY privilege
      ) AS runtime_drizzle_schema_privileges,
      ARRAY(
        SELECT privilege
        FROM unnest(ARRAY[
          'DELETE', 'INSERT', 'REFERENCES', 'SELECT',
          'TRIGGER', 'TRUNCATE', 'UPDATE'
        ]::text[]) privilege
        WHERE pg_catalog.has_table_privilege(
          runtime_role.oid,
          ledger.oid,
          privilege
        )
        ORDER BY privilege
      ) AS runtime_ledger_privileges,
      ARRAY(
        SELECT privilege
        FROM unnest(ARRAY['SELECT', 'UPDATE', 'USAGE']::text[]) privilege
        WHERE pg_catalog.has_sequence_privilege(
          runtime_role.oid,
          sequence_relation.oid,
          privilege
        )
        ORDER BY privilege
      ) AS runtime_sequence_privileges,
      ARRAY(
        SELECT privilege
        FROM unnest(ARRAY['CREATE', 'USAGE']::text[]) privilege
        WHERE pg_catalog.has_schema_privilege(
          platform_role.oid,
          namespaces.oid,
          privilege
        )
        ORDER BY privilege
      ) AS platform_drizzle_schema_privileges,
      ARRAY(
        SELECT privilege
        FROM unnest(ARRAY[
          'DELETE', 'INSERT', 'REFERENCES', 'SELECT',
          'TRIGGER', 'TRUNCATE', 'UPDATE'
        ]::text[]) privilege
        WHERE pg_catalog.has_table_privilege(
          platform_role.oid,
          ledger.oid,
          privilege
        )
        ORDER BY privilege
      ) AS platform_ledger_privileges,
      ARRAY(
        SELECT privilege
        FROM unnest(ARRAY['SELECT', 'UPDATE', 'USAGE']::text[]) privilege
        WHERE pg_catalog.has_sequence_privilege(
          platform_role.oid,
          sequence_relation.oid,
          privilege
        )
        ORDER BY privilege
      ) AS platform_sequence_privileges,
      pg_catalog.pg_get_userbyid(namespaces.nspowner) AS schema_owner,
      pg_catalog.pg_get_userbyid(ledger.relowner) AS table_owner,
      pg_catalog.pg_get_userbyid(sequence_relation.relowner) AS sequence_owner,
      pg_catalog.pg_get_serial_sequence(
        'drizzle.__drizzle_migrations', 'id'
      ) AS serial_sequence,
      (SELECT count(*) FROM pg_catalog.pg_constraint constraints
       WHERE constraints.conrelid = ledger.oid) AS constraint_count,
      (SELECT count(*) FROM pg_catalog.pg_constraint constraints
       WHERE constraints.conrelid = ledger.oid
         AND constraints.contype = 'p'
         AND constraints.convalidated) AS primary_constraint_count,
      (SELECT count(*) FROM pg_catalog.pg_constraint constraints
       WHERE constraints.confrelid = ledger.oid
         AND constraints.conrelid <> ledger.oid)
        AS incoming_foreign_key_count,
      pg_catalog.pg_get_constraintdef(primary_key.oid, false)
        AS primary_constraint_definition,
      (SELECT count(*) FROM pg_catalog.pg_index indexes
       WHERE indexes.indrelid = ledger.oid) AS index_count,
      (SELECT count(*) FROM pg_catalog.pg_index indexes
       WHERE indexes.indrelid = ledger.oid
         AND indexes.indisprimary
         AND indexes.indisunique
         AND indexes.indisvalid
         AND indexes.indisready
         AND indexes.indislive) AS primary_index_count,
      pg_catalog.pg_get_indexdef(primary_key.conindid, 0, false)
        AS primary_index_definition,
      (SELECT count(*) FROM pg_catalog.pg_trigger triggers
       WHERE triggers.tgrelid = ledger.oid AND NOT triggers.tgisinternal)
        AS noninternal_trigger_count,
      (SELECT count(*) FROM pg_catalog.pg_trigger triggers
       WHERE triggers.tgrelid = ledger.oid) AS total_trigger_count,
      (SELECT count(*) FROM pg_catalog.pg_rewrite rules
       WHERE rules.ev_class = ledger.oid) AS rule_count,
      (SELECT count(*) FROM pg_catalog.pg_policy policies
       WHERE policies.polrelid = ledger.oid) AS policy_count,
      (SELECT count(*) FROM pg_catalog.pg_publication publications
       WHERE publications.puballtables
          OR EXISTS (
            SELECT 1 FROM pg_catalog.pg_publication_rel members
            WHERE members.prpubid = publications.oid
              AND members.prrelid = ledger.oid
          )
          OR EXISTS (
            SELECT 1 FROM pg_catalog.pg_publication_namespace schema_members
            WHERE schema_members.pnpubid = publications.oid
              AND schema_members.pnnspid = namespaces.oid
          )) AS publication_count,
      ((SELECT count(*) FROM pg_catalog.pg_inherits inheritance
        WHERE inheritance.inhrelid = ledger.oid) +
       (SELECT count(*) FROM pg_catalog.pg_inherits inheritance
        WHERE inheritance.inhparent = ledger.oid)) AS inheritance_count,
      sequence_relation.relpersistence::text AS sequence_persistence,
      pg_catalog.format_type(sequence_parameters.seqtypid, NULL)
        AS sequence_data_type,
      sequence_parameters.seqstart::text AS sequence_start_value,
      sequence_parameters.seqmin::text AS sequence_min_value,
      sequence_parameters.seqmax::text AS sequence_max_value,
      sequence_parameters.seqincrement::text AS sequence_increment,
      sequence_parameters.seqcache::text AS sequence_cache_size,
      sequence_parameters.seqcycle AS sequence_cycle,
      sequence_relation.relowner = ledger.relowner
        AS sequence_owner_matches_ledger,
      ARRAY(
        SELECT
          (CASE WHEN grants.grantee = 0
            THEN 'PUBLIC'
            ELSE pg_catalog.pg_get_userbyid(grants.grantee)
           END) || ':' || pg_catalog.pg_get_userbyid(grants.grantor) || ':' ||
          grants.privilege_type || ':' ||
          grants.is_grantable::text
        FROM pg_catalog.aclexplode(COALESCE(
          namespaces.nspacl,
          pg_catalog.acldefault('n', namespaces.nspowner)
        )) grants
        ORDER BY 1
      ) AS schema_acl,
      ARRAY(
        SELECT
          (CASE WHEN grants.grantee = 0
            THEN 'PUBLIC'
            ELSE pg_catalog.pg_get_userbyid(grants.grantee)
           END) || ':' || pg_catalog.pg_get_userbyid(grants.grantor) || ':' ||
          grants.privilege_type || ':' ||
          grants.is_grantable::text
        FROM pg_catalog.aclexplode(COALESCE(
          ledger.relacl,
          pg_catalog.acldefault('r', ledger.relowner)
        )) grants
        ORDER BY 1
      ) AS table_acl,
      ARRAY(
        SELECT
          (CASE WHEN grants.grantee = 0
            THEN 'PUBLIC'
            ELSE pg_catalog.pg_get_userbyid(grants.grantee)
           END) || ':' || pg_catalog.pg_get_userbyid(grants.grantor) || ':' ||
          grants.privilege_type || ':' ||
          grants.is_grantable::text
        FROM pg_catalog.aclexplode(COALESCE(
          sequence_relation.relacl,
          pg_catalog.acldefault('s', sequence_relation.relowner)
        )) grants
        ORDER BY 1
      ) AS sequence_acl,
      (SELECT count(*)
       FROM pg_catalog.pg_attribute attributes
       CROSS JOIN LATERAL pg_catalog.aclexplode(attributes.attacl) grants
       WHERE attributes.attrelid = ledger.oid
         AND attributes.attacl IS NOT NULL) AS table_column_acl_count,
      sequence_state.last_value::text AS sequence_last_value,
      sequence_state.is_called AS sequence_is_called,
      (SELECT max(id) FROM drizzle.__drizzle_migrations)
        AS maximum_ledger_id
    FROM pg_catalog.pg_class ledger
    JOIN pg_catalog.pg_namespace namespaces ON namespaces.oid = ledger.relnamespace
    LEFT JOIN LATERAL (
      SELECT constraints.oid, constraints.conindid
      FROM pg_catalog.pg_constraint constraints
      WHERE constraints.conrelid = ledger.oid
        AND constraints.contype = 'p'
        AND constraints.convalidated
    ) primary_key ON true
    JOIN pg_catalog.pg_class sequence_relation
      ON sequence_relation.oid = pg_catalog.to_regclass(
        'drizzle.__drizzle_migrations_id_seq'
      )
     AND sequence_relation.relkind = 'S'
    JOIN pg_catalog.pg_sequence sequence_parameters
      ON sequence_parameters.seqrelid = sequence_relation.oid
    JOIN pg_catalog.pg_roles runtime_role
      ON runtime_role.rolname = $1
    JOIN pg_catalog.pg_roles platform_role
      ON platform_role.rolname = $2
    CROSS JOIN drizzle.__drizzle_migrations_id_seq sequence_state
    WHERE namespaces.nspname = 'drizzle'
      AND ledger.relname = '__drizzle_migrations'
  `,
    [expectedRuntimeRole, expectedPlatformRole],
  );
  if (result.rows.length !== 1) {
    throw new Error("The exact Drizzle ledger relation was not found.");
  }
  const row = result.rows[0];
  assertLedgerTableContract(
    {
      columnContract: columns.rows.map(
        (column) =>
          `${integer(column.position, "ledger column position")}:${column.name}:${column.type_name}:${column.not_null}:${column.identity_kind !== ""}:${column.generated !== ""}:${column.default_expression ?? "<none>"}`,
      ),
      constraintCount: integer(row.constraint_count, "ledger constraint count"),
      forceRls: row.force_rls,
      indexCount: integer(row.index_count, "ledger index count"),
      incomingForeignKeyCount: integer(
        row.incoming_foreign_key_count,
        "incoming ledger foreign-key count",
      ),
      inheritanceCount: integer(
        row.inheritance_count,
        "ledger inheritance count",
      ),
      nonInternalTriggerCount: integer(
        row.noninternal_trigger_count,
        "ledger trigger count",
      ),
      persistence: row.persistence,
      platformBypassesRls: row.platform_bypasses_rls,
      platformCanCreateCurrentDatabase:
        row.platform_can_create_current_database,
      platformCanCreateDatabase: row.platform_can_create_database,
      platformCanCreateRole: row.platform_can_create_role,
      platformCanLogin: row.platform_can_login,
      platformDrizzleSchemaPrivileges: row.platform_drizzle_schema_privileges,
      platformLedgerPrivileges: row.platform_ledger_privileges,
      platformRoleMemberships: roleMembershipEdges(
        row.platform_role_memberships,
        "platform",
      ),
      platformOwnedObjectCount: integer(
        row.platform_owned_object_count,
        "platform role owned object count",
      ),
      platformOwnsDatabase: row.platform_owns_database,
      platformReplication: row.platform_replication,
      platformRoleConfig: row.platform_role_config,
      platformRoleDatabaseSettingCount: integer(
        row.platform_role_database_setting_count,
        "platform role database setting count",
      ),
      platformRoleName: row.platform_role_name,
      platformSequencePrivileges: row.platform_sequence_privileges,
      platformSuperuser: row.platform_superuser,
      policyCount: integer(row.policy_count, "ledger policy count"),
      publicationCount: integer(
        row.publication_count,
        "ledger publication count",
      ),
      primaryConstraintDefinition: row.primary_constraint_definition,
      primaryConstraintCount: integer(
        row.primary_constraint_count,
        "ledger primary constraint count",
      ),
      primaryIndexDefinition: row.primary_index_definition,
      primaryIndexCount: integer(
        row.primary_index_count,
        "ledger primary index count",
      ),
      relationKind: row.relation_kind,
      rls: row.rls,
      ruleCount: integer(row.rule_count, "ledger rule count"),
      runtimeBypassesRls: row.runtime_bypasses_rls,
      runtimeCanCreateCurrentDatabase: row.runtime_can_create_current_database,
      runtimeCanCreateDatabase: row.runtime_can_create_database,
      runtimeCanCreateRole: row.runtime_can_create_role,
      runtimeCanLogin: row.runtime_can_login,
      runtimeDrizzleSchemaPrivileges: row.runtime_drizzle_schema_privileges,
      runtimeLedgerPrivileges: row.runtime_ledger_privileges,
      runtimeRoleMemberships: roleMembershipEdges(
        row.runtime_role_memberships,
        "runtime",
      ),
      runtimeOwnedObjectCount: integer(
        row.runtime_owned_object_count,
        "runtime role owned object count",
      ),
      runtimeOwnsDatabase: row.runtime_owns_database,
      runtimeReplication: row.runtime_replication,
      runtimeRoleConfig: row.runtime_role_config,
      runtimeRoleDatabaseSettingCount: integer(
        row.runtime_role_database_setting_count,
        "runtime role database setting count",
      ),
      runtimeRoleName: row.runtime_role_name,
      runtimeSequencePrivileges: row.runtime_sequence_privileges,
      runtimeSuperuser: row.runtime_superuser,
      schemaAcl: row.schema_acl,
      schemaOwner: row.schema_owner,
      serverVersionNumber: integer(
        row.server_version_number,
        "PostgreSQL server version number",
      ),
      sequenceAcl: row.sequence_acl,
      sequenceCacheSize: row.sequence_cache_size,
      sequenceCycle: row.sequence_cycle,
      sequenceDataType: row.sequence_data_type,
      sequenceIncrement: row.sequence_increment,
      sequenceIsCalled: row.sequence_is_called,
      sequenceLastValue: row.sequence_last_value,
      sequenceMaxValue: row.sequence_max_value,
      sequenceMinValue: row.sequence_min_value,
      sequenceOwner: row.sequence_owner,
      sequenceOwnerMatchesLedger: row.sequence_owner_matches_ledger,
      sequencePersistence: row.sequence_persistence,
      sequenceStartValue: row.sequence_start_value,
      serialSequence: row.serial_sequence,
      tableAcl: row.table_acl,
      tableColumnAclCount: integer(
        row.table_column_acl_count,
        "ledger column ACL count",
      ),
      tableOwner: row.table_owner,
      totalTriggerCount: integer(
        row.total_trigger_count,
        "total ledger trigger count",
      ),
      maximumLedgerId: integer(row.maximum_ledger_id, "maximum ledger ID"),
    },
    expectedOwner,
    expectedRuntimeRole,
    expectedPlatformRole,
  );
}

async function readCatalogInvariants(
  client: SqlClient,
): Promise<CatalogInvariants> {
  const coverage = await client.query<{
    forced_rls_count: unknown;
    policy_covered_count: unknown;
    public_table_count: unknown;
    rls_bypassed_count: unknown;
    rls_count: unknown;
  }>(`
    SELECT
      count(*) AS public_table_count,
      count(*) FILTER (WHERE tables.relrowsecurity) AS rls_count,
      count(*) FILTER (WHERE tables.relforcerowsecurity) AS forced_rls_count,
      count(*) FILTER (
        WHERE NOT pg_catalog.row_security_active(tables.oid)
      ) AS rls_bypassed_count,
      count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM pg_catalog.pg_policy policies
        WHERE policies.polrelid = tables.oid
      )) AS policy_covered_count
    FROM pg_catalog.pg_class tables
    JOIN pg_catalog.pg_namespace namespaces ON namespaces.oid = tables.relnamespace
    WHERE namespaces.nspname = 'public'
      AND tables.relkind IN ('r', 'p')
  `);
  const coverageRow =
    coverage.rows[0] || ({} as (typeof coverage.rows)[number]);
  const publicTableCount = integer(
    coverageRow.public_table_count,
    "public table count",
  );
  const rlsBypassedTableCount = integer(
    coverageRow.rls_bypassed_count,
    "RLS-bypassed table count",
  );
  if (publicTableCount !== 144 || rlsBypassedTableCount !== publicTableCount) {
    throw new Error(
      "The adoption role cannot bypass RLS on every audited public table.",
    );
  }
  const health = await client.query<{
    invalid_index_count: unknown;
    public_column_acl_count: unknown;
    trigger_count: unknown;
    unvalidated_constraint_count: unknown;
  }>(`
    SELECT
      (SELECT count(*)
       FROM pg_catalog.pg_index indexes
       JOIN pg_catalog.pg_class tables ON tables.oid = indexes.indrelid
       JOIN pg_catalog.pg_namespace namespaces ON namespaces.oid = tables.relnamespace
       WHERE namespaces.nspname = 'public'
         AND (NOT indexes.indisvalid OR NOT indexes.indisready OR NOT indexes.indislive)
      ) AS invalid_index_count,
      (SELECT count(*)
       FROM pg_catalog.pg_attribute attributes
       JOIN pg_catalog.pg_class tables ON tables.oid = attributes.attrelid
       JOIN pg_catalog.pg_namespace namespaces ON namespaces.oid = tables.relnamespace
       WHERE namespaces.nspname = 'public'
         AND attributes.attacl IS NOT NULL
         AND cardinality(attributes.attacl) > 0
      ) AS public_column_acl_count,
      (SELECT count(*)
       FROM pg_catalog.pg_constraint constraints
       JOIN pg_catalog.pg_class tables ON tables.oid = constraints.conrelid
       JOIN pg_catalog.pg_namespace namespaces ON namespaces.oid = tables.relnamespace
       WHERE namespaces.nspname = 'public' AND NOT constraints.convalidated
      ) AS unvalidated_constraint_count,
      (SELECT count(*)
       FROM pg_catalog.pg_trigger triggers
       JOIN pg_catalog.pg_class tables ON tables.oid = triggers.tgrelid
       JOIN pg_catalog.pg_namespace namespaces ON namespaces.oid = tables.relnamespace
       WHERE namespaces.nspname = 'public' AND NOT triggers.tgisinternal
      ) AS trigger_count
  `);
  const checks = await client.query<{
    name: string;
    no_inherit: boolean;
    relation: string;
    validated: boolean;
  }>(`
    SELECT
      tables.relname AS relation,
      constraints.conname AS name,
      constraints.convalidated AS validated,
      constraints.connoinherit AS no_inherit
    FROM pg_catalog.pg_constraint constraints
    JOIN pg_catalog.pg_class tables ON tables.oid = constraints.conrelid
    JOIN pg_catalog.pg_namespace namespaces ON namespaces.oid = tables.relnamespace
    WHERE namespaces.nspname = 'public' AND constraints.contype = 'c'
    ORDER BY tables.relname, constraints.conname
  `);
  const indexes = await client.query<{
    columns: string[];
    definition: string;
    is_live: boolean;
    is_partial: boolean;
    is_ready: boolean;
    is_unique: boolean;
    is_valid: boolean;
    name: string;
    relation: string;
  }>(
    `
    SELECT
      index_classes.relname AS name,
      tables.relname AS relation,
      indexes.indisunique AS is_unique,
      indexes.indisvalid AS is_valid,
      indexes.indisready AS is_ready,
      indexes.indislive AS is_live,
      indexes.indpred IS NOT NULL AS is_partial,
      pg_catalog.pg_get_indexdef(indexes.indexrelid, 0, false) AS definition,
      ARRAY(
        SELECT attributes.attname::text
        FROM unnest(indexes.indkey::smallint[]) WITH ORDINALITY AS keys(attnum, position)
        JOIN pg_catalog.pg_attribute attributes
          ON attributes.attrelid = indexes.indrelid
         AND attributes.attnum = keys.attnum
        WHERE keys.position <= indexes.indnkeyatts
        ORDER BY keys.position
      ) AS columns
    FROM pg_catalog.pg_index indexes
    JOIN pg_catalog.pg_class tables ON tables.oid = indexes.indrelid
    JOIN pg_catalog.pg_class index_classes ON index_classes.oid = indexes.indexrelid
    JOIN pg_catalog.pg_namespace namespaces ON namespaces.oid = tables.relnamespace
    WHERE namespaces.nspname = 'public'
      AND index_classes.relname = ANY($1::text[])
    ORDER BY index_classes.relname
  `,
    [EXPECTED_RECONCILIATION_INDEXES.map((index) => index.name)],
  );
  const triggers = await client.query<{
    enabled: string;
    function_name: string;
    name: string;
    relation: string;
    trigger_type: unknown;
  }>(`
    SELECT
      tables.relname AS relation,
      triggers.tgname AS name,
      procedures.proname AS function_name,
      triggers.tgenabled::text AS enabled,
      triggers.tgtype AS trigger_type
    FROM pg_catalog.pg_trigger triggers
    JOIN pg_catalog.pg_class tables ON tables.oid = triggers.tgrelid
    JOIN pg_catalog.pg_namespace namespaces ON namespaces.oid = tables.relnamespace
    JOIN pg_catalog.pg_proc procedures ON procedures.oid = triggers.tgfoid
    WHERE namespaces.nspname = 'public' AND NOT triggers.tgisinternal
    ORDER BY tables.relname, triggers.tgname
  `);
  const defaultResult = await client.query<{
    default_expression: string | null;
  }>(`
    SELECT pg_catalog.pg_get_expr(defaults.adbin, defaults.adrelid, false) AS default_expression
    FROM pg_catalog.pg_attrdef defaults
    JOIN pg_catalog.pg_attribute attributes
      ON attributes.attrelid = defaults.adrelid
     AND attributes.attnum = defaults.adnum
    WHERE defaults.adrelid = 'public.integration_connections'::regclass
      AND attributes.attname = 'mode'
  `);
  const data = await client.query<Record<string, unknown>>(`
    SELECT
      (SELECT count(*) FROM public.integration_connections
       WHERE mode IS NULL OR mode NOT IN ('MOCK', 'LIVE')) AS invalid_integration_modes,
      (SELECT count(*) FROM public.exam_result_hashes WHERE result_id IS NULL)
        AS null_exam_result_hash_links,
      (SELECT count(*) FROM public.metadata_records
       WHERE tenant_id IS NULL OR object_id IS NULL) AS null_metadata_record_links,
      (SELECT count(*) FROM public.metadata_objects
       WHERE tenant_id IS NULL AND status <> 'ARCHIVED' AND api_name IS NULL)
        AS null_system_metadata_api_names,
      (SELECT count(*) FROM public.exams
       WHERE tenant_id IS NULL OR status IS NULL) AS null_exam_index_fields,
      (SELECT count(*) FROM public.metadata_records records
       WHERE records.tenant_id IS NULL
          OR NOT EXISTS (
            SELECT 1
            FROM public.metadata_objects objects
            WHERE objects.id = records.object_id
              AND (
                objects.tenant_id = records.tenant_id
                OR (
                  objects.tenant_id IS NULL
                  AND COALESCE(objects.is_custom, false) = false
                )
              )
          )) AS invalid_metadata_record_object_scope,
      (SELECT count(*) FROM public.metadata_values values_
       WHERE NOT EXISTS (
         SELECT 1
         FROM public.metadata_records records
         JOIN public.metadata_fields fields
           ON fields.id = values_.field_id
          AND fields.object_id = records.object_id
         JOIN public.metadata_objects objects
           ON objects.id = records.object_id
         WHERE records.id = values_.record_id
           AND records.tenant_id IS NOT NULL
           AND (
             objects.tenant_id = records.tenant_id
             OR (
               objects.tenant_id IS NULL
               AND COALESCE(objects.is_custom, false) = false
             )
           )
       )) AS invalid_metadata_value_chain,
      (SELECT count(*) FROM public.bi_dashboards WHERE tenant_id IS NULL)
        AS null_bi_dashboards_tenant,
      (SELECT count(*) FROM public.bi_datasets WHERE tenant_id IS NULL)
        AS null_bi_datasets_tenant,
      (SELECT count(*) FROM public.operator_console_runbooks
       WHERE tenant_id IS NULL) AS null_operator_console_runbooks_tenant,
      (SELECT count(*) FROM (
        SELECT result_id FROM public.exam_result_hashes
        GROUP BY result_id HAVING count(*) > 1
      ) duplicates) AS duplicate_exam_result_hash_links,
      (SELECT count(*) FROM (
        SELECT api_name FROM public.metadata_objects
        WHERE tenant_id IS NULL AND status <> 'ARCHIVED'
        GROUP BY api_name HAVING count(*) > 1
      ) duplicates) AS duplicate_system_metadata_api_names
  `);

  const healthRow = health.rows[0] || ({} as (typeof health.rows)[number]);
  const defaultExpression = defaultResult.rows[0]?.default_expression || "";
  const modeMatch = defaultExpression.match(/'(MOCK|LIVE)'/);
  if (!modeMatch) {
    throw new Error("integration_connections.mode has an unexpected default.");
  }
  const dataRow = data.rows[0] || {};
  if (
    Object.keys(dataRow).sort().join(",") !==
    [...DATA_VIOLATION_KEYS].sort().join(",")
  ) {
    throw new Error("Production data-invariant evidence is incomplete.");
  }
  const dataViolationCounts = Object.fromEntries(
    DATA_VIOLATION_KEYS.map((key) => [
      key,
      integer(dataRow[key], `data invariant ${key}`),
    ]),
  ) as Record<DataViolationKey, number>;
  const dataViolationCount = Object.values(dataViolationCounts).reduce(
    (sum, value) => sum + value,
    0,
  );
  return {
    checkConstraintKeys: checks.rows.map((row) => {
      if (!row.validated || row.no_inherit) {
        throw new Error(
          `CHECK constraint ${row.relation}.${row.name} is unsafe.`,
        );
      }
      return `${row.relation}.${row.name}`;
    }),
    dataViolationCount,
    dataViolationCounts,
    forcedRlsTableCount: integer(
      coverageRow.forced_rls_count,
      "forced RLS table count",
    ),
    indexes: indexes.rows.map((row) => ({
      columns: row.columns,
      definition: row.definition,
      live: row.is_live,
      name: row.name,
      partial: row.is_partial,
      ready: row.is_ready,
      relation: row.relation,
      unique: row.is_unique,
      valid: row.is_valid,
    })),
    integrationModeDefault: modeMatch[1] as "LIVE" | "MOCK",
    invalidIndexCount: integer(
      healthRow.invalid_index_count,
      "invalid index count",
    ),
    policyCoveredTableCount: integer(
      coverageRow.policy_covered_count,
      "policy-covered table count",
    ),
    publicColumnAclCount: integer(
      healthRow.public_column_acl_count,
      "public column ACL count",
    ),
    publicTableCount,
    rlsBypassedTableCount,
    rlsTableCount: integer(coverageRow.rls_count, "RLS table count"),
    triggers: triggers.rows.map((row) => ({
      enabled: row.enabled,
      functionName: row.function_name,
      name: row.name,
      relation: row.relation,
      triggerType: integer(row.trigger_type, "trigger type"),
    })),
    unvalidatedConstraintCount: integer(
      healthRow.unvalidated_constraint_count,
      "unvalidated constraint count",
    ),
  };
}

export function assertCatalogInvariants(invariants: CatalogInvariants): void {
  for (const [label, actual] of [
    ["public table", invariants.publicTableCount],
    ["RLS-enabled table", invariants.rlsTableCount],
    ["FORCE RLS table", invariants.forcedRlsTableCount],
    ["policy-covered table", invariants.policyCoveredTableCount],
    ["RLS-bypassed table", invariants.rlsBypassedTableCount],
  ] as const) {
    if (actual !== 144) throw new Error(`Expected exactly 144 ${label}s.`);
  }
  if (invariants.invalidIndexCount !== 0) {
    throw new Error(
      "Production contains invalid, unready, or non-live indexes.",
    );
  }
  if (invariants.unvalidatedConstraintCount !== 0) {
    throw new Error("Production contains unvalidated constraints.");
  }
  if (invariants.publicColumnAclCount !== 0) {
    throw new Error("Production contains unreviewed public column grants.");
  }
  const namedDataViolationCount = DATA_VIOLATION_KEYS.reduce(
    (sum, key) => sum + integer(invariants.dataViolationCounts[key], key),
    0,
  );
  if (
    Object.keys(invariants.dataViolationCounts).sort().join(",") !==
      [...DATA_VIOLATION_KEYS].sort().join(",") ||
    namedDataViolationCount !== invariants.dataViolationCount ||
    invariants.dataViolationCount !== 0
  ) {
    throw new Error("Production data violates reconciliation invariants.");
  }
  const checks = [...invariants.checkConstraintKeys].sort();
  if (
    checks.length !== 61 ||
    checks.some((key, index) => key !== EXPECTED_CHECK_CONSTRAINTS[index])
  ) {
    throw new Error(
      "Production does not contain the exact 61 legacy CHECK constraints.",
    );
  }
  const indexes = [...invariants.indexes].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  if (indexes.length !== EXPECTED_RECONCILIATION_INDEXES.length) {
    throw new Error(
      "Production does not contain the four reconciliation indexes.",
    );
  }
  for (let index = 0; index < indexes.length; index += 1) {
    const actual = indexes[index];
    const expected = EXPECTED_RECONCILIATION_INDEXES[index];
    if (
      actual.name !== expected.name ||
      actual.relation !== expected.relation ||
      actual.unique !== expected.unique ||
      actual.partial !== expected.partial ||
      !actual.valid ||
      !actual.ready ||
      !actual.live ||
      actual.columns.length !== expected.columns.length ||
      actual.columns.some(
        (column, position) => column !== expected.columns[position],
      ) ||
      actual.definition !== expected.definition
    ) {
      throw new Error(`Reconciliation index ${expected.name} is not exact.`);
    }
  }
  const triggers = [...invariants.triggers].sort((left, right) =>
    `${left.relation}.${left.name}`.localeCompare(
      `${right.relation}.${right.name}`,
    ),
  );
  if (
    triggers.length !== 2 ||
    triggers.some(
      (trigger, index) =>
        `${trigger.relation}.${trigger.name}` !== EXPECTED_TRIGGERS[index] ||
        trigger.functionName !== "notify_entity_change" ||
        trigger.enabled !== "O" ||
        trigger.triggerType !== 21,
    )
  ) {
    throw new Error(
      "Production does not contain the exact two notification triggers.",
    );
  }
}

function assertIdentity(
  identity: AdoptionIdentity,
  configuration: AdoptionConfiguration,
): void {
  if (
    identity.database !== configuration.expectedDatabase ||
    identity.role !== configuration.expectedRole ||
    identity.sessionRole !== configuration.expectedRole ||
    identity.ledgerOwner !== configuration.expectedRole ||
    !identity.migrationOwnerCanSignalBackends ||
    !identity.roleBypassesRls
  ) {
    throw new Error(
      "Connected database identity does not match the approval envelope.",
    );
  }
  if (
    identity.projectIdSetting &&
    identity.projectIdSetting !== configuration.expectedProjectId
  ) {
    throw new Error("Neon project identity setting does not match approval.");
  }
  if (
    identity.branchIdSetting &&
    identity.branchIdSetting !== configuration.expectedBranchId
  ) {
    throw new Error("Neon branch identity setting does not match approval.");
  }
}

export function assertAdoptionEvidence(
  evidence: AdoptionEvidence,
  configuration: AdoptionConfiguration,
): void {
  assertIdentity(evidence.identity, configuration);
  assertCatalogInvariants(evidence.invariants);
  if (!evidence.audit.invariants.readOnlySnapshot) {
    throw new Error("Reconciliation evidence was not marked read-only.");
  }
  if (
    evidence.audit.schema.fingerprint !== configuration.sourceSchemaFingerprint
  ) {
    throw new Error(
      "Live source schema fingerprint is not the approved fingerprint.",
    );
  }
  if (
    evidence.audit.evidenceFingerprint !==
    configuration.sourceEvidenceFingerprint
  ) {
    throw new Error(
      "Live source evidence fingerprint is not the approved fingerprint.",
    );
  }
  if (evidence.audit.ledger.classification !== "divergent") {
    throw new Error(
      "The source ledger is not the recognized historical divergence.",
    );
  }
  assertExactLegacyLedger(
    evidence.audit.ledger.entries.map((entry) => ({
      created_at: entry.createdAt,
      hash: entry.hash,
    })),
  );
}

export function assertPostAdoptionEvidence(
  evidence: AdoptionEvidence,
  configuration: AdoptionConfiguration,
): void {
  assertIdentity(evidence.identity, configuration);
  assertCatalogInvariants(evidence.invariants);
  if (
    !evidence.audit.invariants.readOnlySnapshot ||
    evidence.audit.schema.fingerprint !== configuration.sourceSchemaFingerprint
  ) {
    throw new Error(
      "Fresh post-commit evidence does not preserve the approved source schema.",
    );
  }
  const { baseline } = resolveCurrentBaseline();
  const entries = evidence.audit.ledger.entries;
  if (
    evidence.audit.ledger.classification !== "current-prefix" ||
    entries.length !== 1 ||
    entries[0]?.createdAt !== baseline.createdAt ||
    entries[0]?.hash !== baseline.hash
  ) {
    throw new Error(
      "Fresh post-commit evidence does not contain only the adopted 0000 baseline.",
    );
  }
}

function quotePostgresIdentifier(identifier: string): string {
  if (!identifier || identifier.includes("\0")) {
    throw new Error(
      "The reconciliation report contains an invalid relation name.",
    );
  }
  return `"${identifier.replaceAll('"', '""')}"`;
}

/**
 * The resulting single LOCK statement is deliberately issued before the
 * SERIALIZABLE transaction takes its first MVCC snapshot. SHARE ROW EXCLUSIVE
 * blocks application DML and concurrent material DDL while permitting reads.
 */
export function buildPublicTableWriteFreezeStatement(
  report: ReconciliationCatalogReport,
): string {
  const names = report.schema.sections.relations.rows
    .map(asRecord)
    .filter(
      (row): row is Record<string, unknown> =>
        row !== undefined &&
        row.schema === "public" &&
        (row.kind === "r" || row.kind === "p"),
    )
    .map((row) => row.name)
    .filter((name): name is string => typeof name === "string")
    .sort((left, right) => left.localeCompare(right));
  if (names.length !== 144 || new Set(names).size !== names.length) {
    throw new Error(
      "The approved source evidence does not identify exactly 144 unique public tables to freeze.",
    );
  }
  return `LOCK TABLE ${names
    .map(
      (name) =>
        `${quotePostgresIdentifier("public")}.${quotePostgresIdentifier(name)}`,
    )
    .join(", ")} IN SHARE ROW EXCLUSIVE MODE`;
}

type AuthenticationSaslMessage = { mechanisms?: unknown };
type ObservablePgConnection = {
  on(
    event: "authenticationSASL",
    listener: (message: AuthenticationSaslMessage) => void,
  ): unknown;
};

function installRequiredChannelBindingProbe(client: Client): () => void {
  const internals = client as unknown as {
    connection?: Partial<ObservablePgConnection>;
    enableChannelBinding?: unknown;
  };
  if (
    internals.enableChannelBinding !== true ||
    typeof internals.connection?.on !== "function"
  ) {
    throw new Error(
      "The PostgreSQL driver cannot prove required channel-binding negotiation.",
    );
  }
  let plusWasOffered = false;
  internals.connection.on("authenticationSASL", (message) => {
    plusWasOffered =
      Array.isArray(message.mechanisms) &&
      message.mechanisms.includes("SCRAM-SHA-256-PLUS");
  });
  return () => {
    if (!plusWasOffered) {
      throw new Error(
        "PostgreSQL did not negotiate the required SCRAM-SHA-256-PLUS channel binding.",
      );
    }
  };
}

async function collectAdoptionEvidence(
  client: SqlClient,
  expectedOwner: string,
  expectedRuntimeRole: string,
  expectedPlatformRole: string,
): Promise<AdoptionEvidence> {
  const [audit, identity, invariants] = await Promise.all([
    collectReconciliationCatalog(client),
    readIdentity(client),
    readCatalogInvariants(client),
    assertLiveLedgerTableContract(
      client,
      expectedOwner,
      expectedRuntimeRole,
      expectedPlatformRole,
    ),
  ]);
  return { audit, identity, invariants };
}

export async function replaceExactLegacyLedgerWithinTransaction(
  client: SqlClient,
): Promise<{
  baseline: ReturnType<typeof resolveCurrentBaseline>["baseline"];
  pending: ReturnType<typeof resolveCurrentBaseline>["pending"];
}> {
  const { baseline, pending } = resolveCurrentBaseline();
  const before = await client.query<LedgerRow>(`
    SELECT id, created_at, hash
    FROM drizzle.__drizzle_migrations
    ORDER BY created_at, hash
    FOR UPDATE
  `);
  assertExactLegacyLedger(before.rows);
  const retainedId = integer(
    before.rows.find(
      (row) =>
        String(row.created_at) === EXACT_LEGACY_LEDGER[0].createdAt &&
        row.hash === EXACT_LEGACY_LEDGER[0].hash,
    )?.id,
    "retained ledger row id",
  );
  if (retainedId < 1) throw new Error("The retained ledger row ID is invalid.");
  const removed = await client.query<LedgerRow>(`
    DELETE FROM drizzle.__drizzle_migrations
    RETURNING id, created_at, hash
  `);
  assertExactLegacyLedger(removed.rows);
  await client.query(
    `INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES ($1, $2, $3)`,
    [retainedId, baseline.hash, baseline.createdAt],
  );
  const after = await client.query<LedgerRow>(`
    SELECT id, created_at, hash
    FROM drizzle.__drizzle_migrations
    ORDER BY created_at, hash
  `);
  if (
    after.rows.length !== 1 ||
    integer(after.rows[0]?.id, "adopted ledger row id") !== retainedId ||
    String(after.rows[0]?.created_at) !== baseline.createdAt ||
    after.rows[0]?.hash !== baseline.hash
  ) {
    throw new Error(
      "The ledger did not become the exact current baseline prefix.",
    );
  }
  return { baseline, pending };
}

async function assertTransactionMode(
  client: SqlClient,
  isolation: "repeatable read" | "serializable",
  readOnly: boolean,
): Promise<void> {
  const mode = await client.query<{ isolation: string; read_only: string }>(`
    SELECT
      current_setting('transaction_isolation') AS isolation,
      current_setting('transaction_read_only') AS read_only
  `);
  if (
    mode.rows[0]?.isolation !== isolation ||
    mode.rows[0]?.read_only !== (readOnly ? "on" : "off")
  ) {
    throw new Error(
      "PostgreSQL did not establish the required transaction mode.",
    );
  }
}

export interface AdoptionRuntimeDependencies {
  collectCatalog?: typeof collectReconciliationCatalog;
  collectEvidence?: typeof collectAdoptionEvidence;
  createSnapshot?: typeof createNeonRecoverySnapshotUnderWriteFreeze;
  verifyGitHub?: typeof verifyGitHubProtectedMain;
  verifyAdoptionFiles?: typeof assertExactAdoptionFiles;
  verifyProvider?: typeof verifyNeonProviderIdentity;
  verifyLedgerContract?: typeof assertLiveLedgerTableContract;
  verifyTargetArtifact?: typeof loadAndAssertTargetReconciliationEvidence;
  writeSourceEvidence?: typeof writeSourceReconciliationEvidenceArtifact;
}

export async function runLegacyProductionLedgerAdoption(
  environment: NodeJS.ProcessEnv = process.env,
  createClient: (
    options: ConstructorParameters<typeof Client>[0] & {
      enableChannelBinding: true;
    },
  ) => Client = (options) => new Client(options),
  fetchImplementation: typeof fetch = fetch,
  dependencies: AdoptionRuntimeDependencies = {},
): Promise<AdoptionResult> {
  const runStartedAt = new Date();
  const configuration = resolveAdoptionConfiguration(environment, runStartedAt);
  const verifyAdoptionFiles =
    dependencies.verifyAdoptionFiles ?? assertExactAdoptionFiles;
  verifyAdoptionFiles(
    required(environment, "GITHUB_WORKSPACE"),
    configuration,
    environment,
  );
  const verifyTargetArtifact =
    dependencies.verifyTargetArtifact ??
    loadAndAssertTargetReconciliationEvidence;
  const verifyProvider =
    dependencies.verifyProvider ?? verifyNeonProviderIdentity;
  const createSnapshot =
    dependencies.createSnapshot ?? createNeonRecoverySnapshotUnderWriteFreeze;
  const verifyGitHub = dependencies.verifyGitHub ?? verifyGitHubProtectedMain;
  const collectEvidence =
    dependencies.collectEvidence ?? collectAdoptionEvidence;
  const collectCatalog =
    dependencies.collectCatalog ?? collectReconciliationCatalog;
  const verifyLedgerContract =
    dependencies.verifyLedgerContract ?? assertLiveLedgerTableContract;
  const writeSourceEvidence =
    dependencies.writeSourceEvidence ??
    writeSourceReconciliationEvidenceArtifact;
  verifyTargetArtifact(configuration, environment);
  const neonApiKey = required(environment, ADOPTION_ENV.neonApiKey);
  const githubToken = required(environment, "GITHUB_TOKEN");
  await Promise.all([
    verifyProvider(configuration, neonApiKey, fetchImplementation),
    verifyGitHub(configuration, githubToken, fetchImplementation),
  ]);
  const client = createClient({
    connectionString: configuration.connectionString,
    enableChannelBinding: configuration.enableChannelBinding,
    ssl: configuration.ssl,
    application_name: "school-sis-one-time-legacy-ledger-adoption",
  });
  const assertRequiredChannelBinding =
    installRequiredChannelBindingProbe(client);
  let connected = false;
  const heldLocks: string[] = [];
  let transactionStarted = false;
  try {
    await client.connect();
    connected = true;
    assertRequiredChannelBinding();
    await client.query("SET statement_timeout = '120s'");
    await client.query("SET lock_timeout = '15s'");
    await client.query("SET idle_in_transaction_session_timeout = '600s'");
    for (const [lockName, label] of [
      [LEGACY_LEDGER_ADVISORY_LOCK, "legacy-ledger adoption"],
      [DEPLOYMENT_MIGRATION_LOCK_NAME, "deployment migration"],
    ] as const) {
      const lock = await client.query<{ acquired: boolean }>(
        `SELECT pg_catalog.pg_try_advisory_lock(pg_catalog.hashtextextended($1, 0)) AS acquired`,
        [lockName],
      );
      if (lock.rows[0]?.acquired !== true) {
        throw new Error(`Another session holds the ${label} advisory lock.`);
      }
      heldLocks.push(lockName);
    }

    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    transactionStarted = true;
    await assertTransactionMode(client, "repeatable read", true);
    const readOnlyEvidence = await collectEvidence(
      client,
      configuration.expectedRole,
      configuration.expectedRuntimeRole,
      configuration.expectedPlatformRole,
    );
    assertAdoptionEvidence(readOnlyEvidence, configuration);
    const publicTableWriteFreeze = buildPublicTableWriteFreezeStatement(
      readOnlyEvidence.audit,
    );
    await client.query("COMMIT");
    transactionStarted = false;

    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE");
    transactionStarted = true;
    await client.query(
      "LOCK TABLE drizzle.__drizzle_migrations IN ACCESS EXCLUSIVE MODE",
    );
    await client.query(publicTableWriteFreeze);
    await assertTransactionMode(client, "serializable", false);
    const mutationEvidence = await collectEvidence(
      client,
      configuration.expectedRole,
      configuration.expectedRuntimeRole,
      configuration.expectedPlatformRole,
    );
    assertAdoptionEvidence(mutationEvidence, configuration);
    if (
      mutationEvidence.audit.schema.fingerprint !==
        readOnlyEvidence.audit.schema.fingerprint ||
      mutationEvidence.audit.evidenceFingerprint !==
        readOnlyEvidence.audit.evidenceFingerprint
    ) {
      throw new Error(
        "Reconciliation evidence changed between preflight and mutation.",
      );
    }
    const sourceEvidenceArtifact = writeSourceEvidence(
      mutationEvidence.audit,
      environment,
    );
    assertAdoptionRunDeadline(runStartedAt);
    await Promise.all([
      verifyProvider(configuration, neonApiKey, fetchImplementation),
      verifyGitHub(configuration, githubToken, fetchImplementation),
    ]);
    const recoverySnapshot = await createSnapshot(
      configuration,
      neonApiKey,
      fetchImplementation,
    );
    await Promise.all([
      verifyProvider(
        configuration,
        neonApiKey,
        fetchImplementation,
        recoverySnapshot,
      ),
      verifyGitHub(configuration, githubToken, fetchImplementation),
    ]);
    assertAdoptionTimingIsFresh(configuration, recoverySnapshot, runStartedAt);
    verifyAdoptionFiles(
      required(environment, "GITHUB_WORKSPACE"),
      configuration,
      environment,
    );
    await assertMigrationOwnerCanSignalBackends(client);
    const { baseline, pending } =
      await replaceExactLegacyLedgerWithinTransaction(client);
    await verifyLedgerContract(
      client,
      configuration.expectedRole,
      configuration.expectedRuntimeRole,
      configuration.expectedPlatformRole,
    );
    const afterSchema = await collectCatalog(client);
    if (
      afterSchema.schema.fingerprint !== configuration.sourceSchemaFingerprint
    ) {
      throw new Error("Schema changed while replacing the migration ledger.");
    }
    await Promise.all([
      verifyProvider(
        configuration,
        neonApiKey,
        fetchImplementation,
        recoverySnapshot,
      ),
      verifyGitHub(configuration, githubToken, fetchImplementation),
    ]);
    assertAdoptionTimingIsFresh(configuration, recoverySnapshot, runStartedAt);
    verifyAdoptionFiles(
      required(environment, "GITHUB_WORKSPACE"),
      configuration,
      environment,
    );
    await assertMigrationOwnerCanSignalBackends(client);
    let advisoryLockCleanup: AdoptionResult["advisoryLockCleanup"] =
      "confirmed";
    transactionStarted = false;
    try {
      await client.query("COMMIT");
    } catch {
      throw new AdoptionCommitOutcomeUnknownError();
    }

    try {
      await Promise.all([
        verifyProvider(
          configuration,
          neonApiKey,
          fetchImplementation,
          recoverySnapshot,
        ),
        verifyGitHub(configuration, githubToken, fetchImplementation),
      ]);
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      transactionStarted = true;
      await assertTransactionMode(client, "repeatable read", true);
      const postCommitEvidence = await collectEvidence(
        client,
        configuration.expectedRole,
        configuration.expectedRuntimeRole,
        configuration.expectedPlatformRole,
      );
      assertPostAdoptionEvidence(postCommitEvidence, configuration);
    } catch (error) {
      if (transactionStarted) {
        await client.query("ROLLBACK").catch(() => undefined);
        transactionStarted = false;
      }
      if (error instanceof AdoptionCommitOutcomeUnknownError) throw error;
      throw new AdoptionPostCommitVerificationError();
    }
    transactionStarted = false;
    try {
      await client.query("ROLLBACK");
    } catch {
      advisoryLockCleanup = "released-by-connection-close";
    }

    while (heldLocks.length > 0) {
      const lockName = heldLocks.at(-1)!;
      try {
        const unlock = await client.query<{ released: boolean }>(
          `SELECT pg_catalog.pg_advisory_unlock(pg_catalog.hashtextextended($1, 0)) AS released`,
          [lockName],
        );
        if (unlock.rows[0]?.released !== true) {
          advisoryLockCleanup = "released-by-connection-close";
        }
      } catch {
        advisoryLockCleanup = "released-by-connection-close";
      }
      heldLocks.pop();
    }
    return {
      advisoryLockCleanup,
      adoptedBaseline: {
        createdAt: baseline.createdAt,
        hash: baseline.hash,
        tag: baseline.tag,
      },
      approvalFingerprint: configuration.approvalFingerprint,
      historicalLedgerProvenanceCommit: LEGACY_LEDGER_PROVENANCE_COMMIT,
      pendingMigration: pending.tag,
      reconciliationDisposition: configuration.reconciliationDisposition,
      recoverySnapshot,
      sourceEvidenceArtifactSha256: sourceEvidenceArtifact.sha256,
      sourceEvidenceFingerprint: configuration.sourceEvidenceFingerprint,
      sourceSchemaFingerprint: configuration.sourceSchemaFingerprint,
      status:
        advisoryLockCleanup === "confirmed"
          ? "adopted"
          : "adopted-with-lock-cleanup-warning",
      targetEvidenceFingerprint: configuration.targetEvidenceFingerprint,
      targetSchemaFingerprint: configuration.targetSchemaFingerprint,
    };
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original sanitized failure.
      }
    }
    throw error;
  } finally {
    if (connected) {
      while (heldLocks.length > 0) {
        const lockName = heldLocks.pop()!;
        await client
          .query(
            `SELECT pg_catalog.pg_advisory_unlock(pg_catalog.hashtextextended($1, 0))`,
            [lockName],
          )
          .catch(() => undefined);
      }
    }
    if (connected) await client.end().catch(() => undefined);
  }
}

async function main(): Promise<void> {
  try {
    const result = await runLegacyProductionLedgerAdoption();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    if (error instanceof AdoptionCommitOutcomeUnknownError) {
      process.stderr.write(
        "Legacy ledger adoption outcome is unknown after COMMIT; do not retry. Inspect the exact production ledger first.\n",
      );
      process.exitCode = 2;
      return;
    }
    if (error instanceof AdoptionPostCommitVerificationError) {
      process.stderr.write(
        "Legacy ledger adoption committed, but fresh verification failed; do not retry or migrate until inspected.\n",
      );
      process.exitCode = 3;
      return;
    }
    const message = redactAuditError(
      error,
      process.env[ADOPTION_ENV.databaseUrl],
    );
    process.stderr.write(`Legacy ledger adoption refused: ${message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith("/adopt-legacy-production-ledger.ts")) {
  void main();
}
