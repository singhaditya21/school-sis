import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { Client } from "pg";

import { buildReconciliationCatalogReport } from "../../scripts/audit-migration-reconciliation";
import {
  ADOPTION_CONFIRMATION,
  ADOPTION_ENV,
  AdoptionCommitOutcomeUnknownError,
  AdoptionPostCommitVerificationError,
  DATA_VIOLATION_KEYS,
  DEPLOYMENT_MIGRATION_LOCK_NAME,
  EXACT_ADOPTION_MIGRATION_CHAIN,
  EXACT_DEPLOYMENT_MIGRATIONS_SHA256,
  EXACT_LEGACY_LEDGER,
  EXACT_TENANT_CONTEXT_KEY_CONTRACT_SHA256,
  EXACT_TENANT_RLS_SHA256,
  EXPECTED_CHECK_CONSTRAINTS,
  EXPECTED_RECONCILIATION_INDEXES,
  EXPECTED_TRIGGERS,
  LEGACY_LEDGER_ADVISORY_LOCK,
  LEGACY_LEDGER_PROVENANCE_COMMIT,
  MAX_ADOPTION_RUN_DURATION_MS,
  REVIEWED_FORWARD_RECONCILIATION,
  REVIEWED_PRODUCTION_IDENTITY,
  RESTORE_DRILL_ATTESTATION,
  SNAPSHOT_CONFIRMATION,
  SOURCE_EVIDENCE_ARTIFACT_FILENAME,
  assertAdoptionRoleMembershipsAreSafe,
  assertAdoptionEvidence,
  assertAdoptionTimingIsFresh,
  assertCatalogInvariants,
  assertExactAdoptionFileContents,
  assertExactAdoptionFiles,
  assertExactTransitionInputContents,
  assertExactLegacyLedger,
  assertLedgerTableContract,
  assertLiveLedgerTableContract,
  assertMigrationOwnerCanSignalBackends,
  assertTargetReconciliationEvidence,
  assertTenantContextCredentialContract,
  buildPublicTableWriteFreezeStatement,
  computeAdoptionApprovalFingerprintFromEnvironment,
  createNeonRecoverySnapshotUnderWriteFreeze,
  loadAndAssertTargetReconciliationEvidence,
  replaceExactLegacyLedgerWithinTransaction,
  resolveAdoptionConfiguration,
  resolveCurrentBaseline,
  runLegacyProductionLedgerAdoption,
  verifyGitHubProtectedMain,
  verifyNeonProviderIdentity,
  writeSourceReconciliationEvidenceArtifact,
  type AdoptionConfiguration,
  type AdoptionEvidence,
  type AdoptionRoleMembershipEdge,
  type CatalogInvariants,
  type NeonRecoverySnapshotEvidence,
} from "../../scripts/adopt-legacy-production-ledger";

const NOW = new Date("2026-08-15T19:00:00.000Z");
const DIRECT_HOST = "ep-school-sis.c-2.ap-southeast-1.aws.neon.tech";
const GITHUB_RUN_URL =
  "https://github.com/singhaditya21/school-sis/actions/runs/123456789";
const TEST_TENANT_CONTEXT_SECRET = "A".repeat(43);
const TEST_TENANT_CONTEXT_SECRET_SHA256 = createHash("sha256")
  .update(TEST_TENANT_CONTEXT_SECRET)
  .digest("hex");

function adoptionEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    GITHUB_ACTOR: "singhaditya21",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REF: "refs/heads/main",
    GITHUB_REF_NAME: "main",
    GITHUB_REF_PROTECTED: "true",
    GITHUB_REF_TYPE: "branch",
    GITHUB_REPOSITORY: "singhaditya21/school-sis",
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_RUN_ID: "123456789",
    GITHUB_SHA: "a".repeat(40),
    GITHUB_TRIGGERING_ACTOR: "singhaditya21",
    [ADOPTION_ENV.approvedAt]: "2026-08-15T18:45:00.000Z",
    [ADOPTION_ENV.approvedBy]: "singhaditya21",
    [ADOPTION_ENV.confirmation]: ADOPTION_CONFIRMATION,
    [ADOPTION_ENV.databaseUrl]:
      `postgresql://neondb_owner:never-log-this@${DIRECT_HOST}/neondb` +
      "?sslmode=verify-full&channel_binding=require",
    [ADOPTION_ENV.expectedBranchId]: "br-hidden-union-ao8rd4ha",
    [ADOPTION_ENV.expectedDatabase]: "neondb",
    [ADOPTION_ENV.expectedHistoricalCommit]: LEGACY_LEDGER_PROVENANCE_COMMIT,
    [ADOPTION_ENV.expectedHost]: DIRECT_HOST,
    [ADOPTION_ENV.expectedPlatformRole]: "school_sis_platform",
    [ADOPTION_ENV.expectedProjectId]: "wispy-leaf-40556376",
    [ADOPTION_ENV.expectedRole]: "neondb_owner",
    [ADOPTION_ENV.expectedRuntimeRole]: "school_sis_runtime",
    [ADOPTION_ENV.expectedTenantContextKeyId]: "prod-test-v1",
    [ADOPTION_ENV.expectedTenantContextSecretSha256]:
      TEST_TENANT_CONTEXT_SECRET_SHA256,
    [ADOPTION_ENV.githubCommitSha]: "a".repeat(40),
    [ADOPTION_ENV.githubPullRequestUrl]:
      "https://github.com/singhaditya21/school-sis/pull/59",
    [ADOPTION_ENV.githubRepository]: "singhaditya21/school-sis",
    [ADOPTION_ENV.githubRunUrl]: GITHUB_RUN_URL,
    [ADOPTION_ENV.reconciliationDisposition]:
      "FORWARD_RECONCILIATION_0001_REVIEWED",
    [ADOPTION_ENV.restoreDrillAttestation]: RESTORE_DRILL_ATTESTATION,
    [ADOPTION_ENV.snapshotConfirmation]: SNAPSHOT_CONFIRMATION,
    [ADOPTION_ENV.snapshotConsoleUrl]:
      "https://console.neon.tech/app/projects/wispy-leaf-40556376/branches/br-hidden-union-ao8rd4ha",
    [ADOPTION_ENV.snapshotName]: "legacy-adoption-aaaaaaaaaaaa-123456789",
    [ADOPTION_ENV.sourceEvidenceFingerprint]:
      REVIEWED_FORWARD_RECONCILIATION.sourceEvidenceFingerprint,
    [ADOPTION_ENV.sourceEvidenceUrl]: GITHUB_RUN_URL,
    [ADOPTION_ENV.sourceSchemaFingerprint]:
      REVIEWED_FORWARD_RECONCILIATION.sourceSchemaFingerprint,
    [ADOPTION_ENV.sslMode]: "verify-full",
    [ADOPTION_ENV.targetEvidenceArtifactPath]:
      "/tmp/current-baseline-evidence.json",
    [ADOPTION_ENV.targetEvidenceArtifactSha256]:
      REVIEWED_FORWARD_RECONCILIATION.targetEvidenceArtifactSha256,
    [ADOPTION_ENV.targetEvidenceFingerprint]:
      REVIEWED_FORWARD_RECONCILIATION.targetEvidenceFingerprint,
    [ADOPTION_ENV.targetEvidenceUrl]: GITHUB_RUN_URL,
    [ADOPTION_ENV.targetSchemaFingerprint]:
      REVIEWED_FORWARD_RECONCILIATION.targetSchemaFingerprint,
    [ADOPTION_ENV.tenantContextSigningSecret]: TEST_TENANT_CONTEXT_SECRET,
  };
  environment[ADOPTION_ENV.approvalFingerprint] =
    computeAdoptionApprovalFingerprintFromEnvironment(environment, NOW);
  return environment;
}

function recoverySnapshot(
  overrides: Partial<NeonRecoverySnapshotEvidence> = {},
): NeonRecoverySnapshotEvidence {
  return {
    createdAt: "2026-08-15T18:58:00.000Z",
    fullSize: "39665664",
    id: "snap-same-run-recovery",
    manual: true,
    name: "legacy-adoption-aaaaaaaaaaaa-123456789",
    sourceBranchId: "br-hidden-union-ao8rd4ha",
    ...overrides,
  };
}

function completeCatalogInvariants(): CatalogInvariants {
  return {
    checkConstraintKeys: [...EXPECTED_CHECK_CONSTRAINTS],
    dataViolationCount: 0,
    dataViolationCounts: Object.fromEntries(
      DATA_VIOLATION_KEYS.map((key) => [key, 0]),
    ) as CatalogInvariants["dataViolationCounts"],
    forcedRlsTableCount: 144,
    indexes: EXPECTED_RECONCILIATION_INDEXES.map((index) => ({
      columns: [...index.columns],
      definition: index.definition,
      live: true,
      name: index.name,
      partial: index.partial,
      ready: true,
      relation: index.relation,
      unique: index.unique,
      valid: true,
    })),
    integrationModeDefault: "MOCK",
    invalidIndexCount: 0,
    policyCoveredTableCount: 144,
    publicColumnAclCount: 0,
    publicTableCount: 144,
    rlsBypassedTableCount: 144,
    rlsTableCount: 144,
    triggers: EXPECTED_TRIGGERS.map((key) => {
      const [relation, name] = key.split(".");
      return {
        enabled: "O",
        functionName: "notify_entity_change",
        name,
        relation,
        triggerType: 21,
      };
    }),
    unvalidatedConstraintCount: 0,
  };
}

function targetReconciliationReport() {
  const tableNames = [
    "integration_connections",
    ...Array.from(
      { length: 143 },
      (_, index) => `table_${String(index).padStart(3, "0")}`,
    ),
  ];
  const acl = (grantee: string, privilege: string) => ({
    grantable: false,
    grantee,
    grantor: "neondb_owner",
    privilege,
  });
  const ownerTableAcl = [
    "DELETE",
    "INSERT",
    "MAINTAIN",
    "REFERENCES",
    "SELECT",
    "TRIGGER",
    "TRUNCATE",
    "UPDATE",
  ].map((privilege) => acl("neondb_owner", privilege));
  const applicationFunctionAcl = [
    acl("neondb_owner", "EXECUTE"),
    acl("school_sis_platform", "EXECUTE"),
    acl("school_sis_runtime", "EXECUTE"),
  ];
  const helper = (
    name: string,
    arguments_: string,
    language: string,
    result: string,
    securityDefiner: boolean,
    volatility: string,
    definition: string,
    applicationAccessible: boolean,
  ) => ({
    acl: applicationAccessible
      ? applicationFunctionAcl
      : [acl("neondb_owner", "EXECUTE")],
    arguments: arguments_,
    configuration: securityDefiner
      ? ["search_path=pg_catalog, pg_temp"]
      : name === "constant_time_equal_32"
        ? ["search_path=pg_catalog, pg_temp"]
        : null,
    definition,
    kind: "f",
    language,
    name,
    owner: "neondb_owner",
    result,
    schema: "app_private",
    securityDefiner,
    volatility,
  });
  const signingKeyConstraintDefinitions: Record<string, string> = {
    tenant_context_signing_keys_audience_format:
      "CHECK (audience ~ 'reviewed')",
    tenant_context_signing_keys_key_id_format: "CHECK (key_id ~ 'reviewed')",
    tenant_context_signing_keys_pkey: "PRIMARY KEY (key_id)",
    tenant_context_signing_keys_secret_length:
      "CHECK ((octet_length(secret) >= 32) AND (octet_length(secret) <= 128))",
  };
  const rolloutConstraintDefinitions: Record<string, string> = {
    tenant_context_rollout_state_audience: "CHECK (promoted_audience IS NULL)",
    tenant_context_rollout_state_deployment_id:
      "CHECK (promoted_deployment_id IS NULL)",
    tenant_context_rollout_state_key_id: "CHECK (promoted_key_id IS NULL)",
    tenant_context_rollout_state_phase: "CHECK (enforcement_phase IN (1, 2))",
    tenant_context_rollout_state_pkey: "PRIMARY KEY (singleton)",
    tenant_context_rollout_state_promotion_complete:
      "CHECK (signed_runtime_sha IS NULL AND promoted_key_id IS NULL AND promoted_audience IS NULL AND promoted_deployment_id IS NULL AND promoted_at IS NULL)",
    tenant_context_rollout_state_sha: "CHECK (signed_runtime_sha IS NULL)",
    tenant_context_rollout_state_singleton: "CHECK (singleton)",
    tenant_context_rollout_state_temp_drain_order:
      "CHECK (temp_drain_completed_at IS NULL OR temp_revoked_at IS NOT NULL)",
  };
  return buildReconciliationCatalogReport({
    catalogRows: {
      columns: [
        {
          schema: "public",
          relation: "integration_connections",
          name: "mode",
          default: "'LIVE'::character varying",
        },
        ...[
          ["key_id", "text", true, null],
          ["audience", "text", true, null],
          ["secret", "bytea", true, null],
          ["created_at", "timestamp with time zone", true, "clock_timestamp()"],
        ].map(([name, type, notNull, defaultValue], index) => ({
          collation: type === "text" ? "pg_catalog.default" : null,
          default: defaultValue,
          generated: "",
          identity: "",
          name,
          notNull,
          position: index + 1,
          relation: "tenant_context_signing_keys",
          schema: "app_private",
          type,
        })),
        ...[
          ["singleton", "boolean", true, "true"],
          ["enforcement_phase", "smallint", true, "1"],
          ["signed_runtime_sha", "text", false, null],
          ["promoted_key_id", "text", false, null],
          ["promoted_audience", "text", false, null],
          ["promoted_deployment_id", "text", false, null],
          ["promoted_at", "timestamp with time zone", false, null],
          ["temp_revoked_at", "timestamp with time zone", false, null],
          ["temp_drain_completed_at", "timestamp with time zone", false, null],
        ].map(([name, type, notNull, defaultValue], index) => ({
          collation: type === "text" ? "pg_catalog.default" : null,
          default: defaultValue,
          generated: "",
          identity: "",
          name,
          notNull,
          position: index + 1,
          relation: "tenant_context_rollout_state",
          schema: "app_private",
          type,
        })),
      ],
      constraints: [
        ...EXPECTED_CHECK_CONSTRAINTS.map((key) => {
          const [relation, name] = key.split(".");
          return {
            schema: "public",
            relation,
            name,
            type: "c",
            validated: true,
          };
        }),
        ...[
          "tenant_context_signing_keys_audience_format",
          "tenant_context_signing_keys_key_id_format",
          "tenant_context_signing_keys_pkey",
          "tenant_context_signing_keys_secret_length",
        ].map((name) => ({
          deferrable: false,
          definition: signingKeyConstraintDefinitions[name],
          initiallyDeferred: false,
          name,
          relation: "tenant_context_signing_keys",
          schema: "app_private",
          type: name.endsWith("_pkey") ? "p" : "c",
          validated: true,
        })),
        ...[
          ["tenant_context_signing_keys_audience_not_null", "audience"],
          ["tenant_context_signing_keys_created_at_not_null", "created_at"],
          ["tenant_context_signing_keys_key_id_not_null", "key_id"],
          ["tenant_context_signing_keys_secret_not_null", "secret"],
        ].map(([name, column]) => ({
          deferrable: false,
          definition: `NOT NULL ${column}`,
          initiallyDeferred: false,
          name,
          relation: "tenant_context_signing_keys",
          schema: "app_private",
          type: "n",
          validated: true,
        })),
        ...[
          "tenant_context_rollout_state_audience",
          "tenant_context_rollout_state_deployment_id",
          "tenant_context_rollout_state_key_id",
          "tenant_context_rollout_state_phase",
          "tenant_context_rollout_state_pkey",
          "tenant_context_rollout_state_promotion_complete",
          "tenant_context_rollout_state_sha",
          "tenant_context_rollout_state_singleton",
          "tenant_context_rollout_state_temp_drain_order",
        ].map((name) => ({
          deferrable: false,
          definition: rolloutConstraintDefinitions[name],
          initiallyDeferred: false,
          name,
          relation: "tenant_context_rollout_state",
          schema: "app_private",
          type: name.endsWith("_pkey") ? "p" : "c",
          validated: true,
        })),
        ...[
          [
            "tenant_context_rollout_state_enforcement_phase_not_null",
            "enforcement_phase",
          ],
          ["tenant_context_rollout_state_singleton_not_null", "singleton"],
        ].map(([name, column]) => ({
          deferrable: false,
          definition: `NOT NULL ${column}`,
          initiallyDeferred: false,
          name,
          relation: "tenant_context_rollout_state",
          schema: "app_private",
          type: "n",
          validated: true,
        })),
      ],
      defaultPrivileges: [
        {
          acl: [
            {
              grantable: false,
              grantee: "school_sis_runtime",
              grantor: "neondb_owner",
              privilege: "SELECT",
            },
          ],
          objectType: "r",
          owner: "neondb_owner",
          schema: "public",
        },
        {
          acl: [
            {
              grantable: false,
              grantee: "school_sis_runtime",
              grantor: "neondb_owner",
              privilege: "USAGE",
            },
          ],
          objectType: "S",
          owner: "neondb_owner",
          schema: "public",
        },
        {
          acl: [],
          objectType: "r",
          owner: "cloud_admin",
          schema: "public",
        },
        {
          acl: [],
          objectType: "S",
          owner: "cloud_admin",
          schema: "public",
        },
      ],
      extensions: [{ name: "pgcrypto", schema: "public", version: "1.4" }],
      functions: [
        helper(
          "constant_time_equal_32",
          "left_value bytea, right_value bytea",
          "plpgsql",
          "boolean",
          false,
          "i",
          "octet_length get_byte",
          false,
        ),
        helper(
          "verified_tenant_id",
          "",
          "plpgsql",
          "uuid",
          true,
          "s",
          "public.hmac pg_current_xact_id() constant_time_equal_32",
          true,
        ),
        helper(
          "current_tenant_id",
          "",
          "plpgsql",
          "uuid",
          false,
          "s",
          "verified_tenant_id tenant_context_enforcement_phase",
          true,
        ),
        helper(
          "has_tenant_context",
          "",
          "sql",
          "boolean",
          false,
          "s",
          "current_tenant_id",
          true,
        ),
        helper(
          "tenant_context_enforcement_phase",
          "",
          "sql",
          "smallint",
          true,
          "s",
          "tenant_context_rollout_state",
          true,
        ),
        helper(
          "rls_bypass",
          "",
          "sql",
          "boolean",
          false,
          "s",
          "school_sis_platform school_sis_runtime",
          true,
        ),
        helper(
          "table_exists",
          "table_name text",
          "sql",
          "boolean",
          false,
          "s",
          "to_regclass",
          false,
        ),
      ],
      indexes: [
        ...EXPECTED_RECONCILIATION_INDEXES.map((index) => ({
          schema: "public",
          relation: index.relation,
          name: index.name,
          primary: false,
          unique: index.unique,
          valid: true,
          ready: true,
          live: true,
          definition: `reviewed:${index.name}`,
        })),
        ...[
          ["tenant_context_signing_keys", "tenant_context_signing_keys_pkey"],
          ["tenant_context_rollout_state", "tenant_context_rollout_state_pkey"],
        ].map(([relation, name]) => ({
          definition: `CREATE UNIQUE INDEX ${name} ON app_private.${relation}`,
          live: true,
          name,
          primary: true,
          ready: true,
          relation,
          schema: "app_private",
          unique: true,
          valid: true,
        })),
      ],
      policies: tableNames.map((relation) => ({
        schema: "public",
        relation,
        name: `${relation}_policy`,
      })),
      relations: [
        ...tableNames.map((name) => ({
          schema: "public",
          name,
          kind: "r",
          rowSecurity: true,
          forceRowSecurity: true,
        })),
        ...["tenant_context_signing_keys", "tenant_context_rollout_state"].map(
          (name) => ({
            acl: ownerTableAcl,
            forceRowSecurity: false,
            kind: "r",
            name,
            owner: "neondb_owner",
            partitionKey: null,
            persistence: "p",
            rowSecurity: false,
            schema: "app_private",
          }),
        ),
      ],
      schemas: [
        { name: "public" },
        {
          acl: [
            acl("neondb_owner", "CREATE"),
            acl("neondb_owner", "USAGE"),
            acl("school_sis_platform", "USAGE"),
            acl("school_sis_runtime", "USAGE"),
          ],
          name: "app_private",
          owner: "neondb_owner",
        },
      ],
      sequences: [],
      triggers: EXPECTED_TRIGGERS.map((key) => {
        const [relation, name] = key.split(".");
        return { schema: "public", relation, name, enabled: "O" };
      }),
      types: [],
      views: [],
    },
    ledgerEntries: EXACT_ADOPTION_MIGRATION_CHAIN.map((migration) => ({
      created_at: migration.createdAt,
      hash: migration.hash,
    })),
    ledgerExists: true,
  });
}

function configurationForTargetReport(
  report = targetReconciliationReport(),
): AdoptionConfiguration {
  return {
    ...resolveAdoptionConfiguration(adoptionEnvironment(), NOW),
    targetEvidenceFingerprint: report.evidenceFingerprint,
    targetSchemaFingerprint: report.schema.fingerprint,
  };
}

function approvedSourceEvidence(
  configuration: AdoptionConfiguration,
): AdoptionEvidence {
  const reference = targetReconciliationReport();
  return {
    audit: {
      ...reference,
      evidenceFingerprint: configuration.sourceEvidenceFingerprint,
      ledger: {
        ...reference.ledger,
        classification: "divergent",
        entries: EXACT_LEGACY_LEDGER.map((entry) => ({
          createdAt: entry.createdAt,
          hash: entry.hash,
        })),
      },
      schema: {
        ...reference.schema,
        fingerprint: configuration.sourceSchemaFingerprint,
      },
    },
    identity: {
      branchIdSetting: configuration.expectedBranchId,
      database: configuration.expectedDatabase,
      ledgerOwner: configuration.expectedRole,
      migrationOwnerCanSignalBackends: true,
      projectIdSetting: configuration.expectedProjectId,
      role: configuration.expectedRole,
      roleBypassesRls: true,
      sessionRole: configuration.expectedRole,
    },
    invariants: completeCatalogInvariants(),
  };
}

function approvedPostAdoptionEvidence(
  configuration: AdoptionConfiguration,
): AdoptionEvidence {
  const evidence = approvedSourceEvidence(configuration);
  const { baseline } = resolveCurrentBaseline();
  evidence.audit.ledger = {
    ...evidence.audit.ledger,
    classification: "current-prefix",
    entries: [{ createdAt: baseline.createdAt, hash: baseline.hash }],
  };
  evidence.audit.invariants = {
    ...evidence.audit.invariants,
    ledgerIsExactCurrentChain: false,
    ledgerIsExactCurrentPrefix: true,
  };
  return evidence;
}

describe("one-time historical ledger identity", () => {
  it("pins all 16 rows to an immutable historical commit", () => {
    expect(LEGACY_LEDGER_PROVENANCE_COMMIT).toBe(
      "f5d781ca354ec00450ee49e109642d243c5158af",
    );
    expect(EXACT_LEGACY_LEDGER).toEqual([
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
  });

  it("rejects missing, extra, reordered-value, and changed rows", () => {
    const exact = EXACT_LEGACY_LEDGER.map((entry) => ({
      created_at: entry.createdAt,
      hash: entry.hash,
    }));
    expect(() => assertExactLegacyLedger(exact)).not.toThrow();
    expect(() => assertExactLegacyLedger(exact.slice(1))).toThrow("exactly 16");
    expect(() =>
      assertExactLegacyLedger([
        ...exact,
        { created_at: "9999999999999", hash: "f".repeat(64) },
      ]),
    ).toThrow("exactly 16");
    expect(() =>
      assertExactLegacyLedger(
        exact.map((entry, index) =>
          index === 8 ? { ...entry, hash: "f".repeat(64) } : entry,
        ),
      ),
    ).toThrow("immutable entry 8");
  });

  it("adopts only 0000 and leaves 0001 pending", () => {
    const { baseline, pending } = resolveCurrentBaseline();
    expect(EXACT_ADOPTION_MIGRATION_CHAIN).toHaveLength(2);
    expect(baseline.tag).toBe("0000_init_baseline");
    expect(baseline).toEqual(EXACT_ADOPTION_MIGRATION_CHAIN[0]);
    expect(pending.tag).toBe("0001_reconcile_production_integrity");
    expect(pending).toEqual(EXACT_ADOPTION_MIGRATION_CHAIN[1]);
  });

  it("independently verifies SQL bytes and journal instead of trusting the manifest", () => {
    const repositoryRoot = resolve(__dirname, "../../../..");
    expect(EXACT_DEPLOYMENT_MIGRATIONS_SHA256).toBe(
      "70a00006390ee6f8db9f900ac923ab564895c6347a7019be6ac4280cdc55fa20",
    );
    expect(EXACT_TENANT_CONTEXT_KEY_CONTRACT_SHA256).toBe(
      "73f4516603089e3d0291c459365deb9b0c34b96eb920c3c0adfd123ccada6009",
    );
    expect(EXACT_TENANT_RLS_SHA256).toBe(
      "f83f0ddd4fd17953204642fc1411f62db2d8c42ee727cf1b95c69fefa4e0bdce",
    );
    expect(() => assertExactAdoptionFiles(repositoryRoot)).not.toThrow();
    const journal = JSON.parse(
      readFileSync(
        join(repositoryRoot, "apps/web/drizzle/meta/_journal.json"),
        "utf8",
      ),
    );
    const sqlByTag = Object.fromEntries(
      EXACT_ADOPTION_MIGRATION_CHAIN.map((migration) => [
        migration.tag,
        readFileSync(
          join(repositoryRoot, `apps/web/drizzle/${migration.tag}.sql`),
        ),
      ]),
    );
    const tenantRlsSql = readFileSync(
      join(repositoryRoot, "packages/api/src/db/migrations/tenant-rls.sql"),
    );
    const deploymentMigrationsSource = readFileSync(
      join(repositoryRoot, "apps/web/scripts/deployment-migrations.ts"),
    );
    expect(deploymentMigrationsSource.toString("utf8")).toContain(
      `"${DEPLOYMENT_MIGRATION_LOCK_NAME}"`,
    );
    const tenantContextKeyContract = readFileSync(
      join(repositoryRoot, ".github/tenant-context-key-contract.json"),
    );
    expect(() =>
      assertExactTransitionInputContents({
        deploymentMigrationsSource,
        tenantContextKeyContract,
        tenantRlsSql,
      }),
    ).not.toThrow();
    expect(() =>
      assertExactTransitionInputContents({
        deploymentMigrationsSource: Buffer.concat([
          deploymentMigrationsSource,
          Buffer.from("\n// tampered\n"),
        ]),
        tenantContextKeyContract,
        tenantRlsSql,
      }),
    ).toThrow("deployment migrator source has changed");
    expect(() =>
      assertExactTransitionInputContents({
        deploymentMigrationsSource,
        tenantContextKeyContract: Buffer.concat([
          tenantContextKeyContract,
          Buffer.from("\n"),
        ]),
        tenantRlsSql,
      }),
    ).toThrow("tenant-context key contract has changed");
    expect(() =>
      assertExactTransitionInputContents({
        deploymentMigrationsSource,
        tenantContextKeyContract,
        tenantRlsSql: Buffer.concat([tenantRlsSql, Buffer.from("\n")]),
      }),
    ).toThrow("tenant-RLS SQL has changed");
    expect(() =>
      assertExactAdoptionFileContents({
        deploymentMigrationsSource,
        journal,
        sqlByTag: {
          ...sqlByTag,
          [EXACT_ADOPTION_MIGRATION_CHAIN[1].tag]: Buffer.concat([
            sqlByTag[EXACT_ADOPTION_MIGRATION_CHAIN[1].tag],
            Buffer.from("\n-- tampered\n"),
          ]),
        },
        tenantContextKeyContract,
        tenantRlsSql,
      }),
    ).toThrow("has changed");
    expect(() =>
      assertExactAdoptionFileContents({
        deploymentMigrationsSource,
        journal,
        sqlByTag,
        tenantContextKeyContract,
        tenantRlsSql: Buffer.concat([
          tenantRlsSql,
          Buffer.from("\n-- tampered\n"),
        ]),
      }),
    ).toThrow("tenant-RLS SQL has changed");
  });

  it("matches the protected signing credential to the exact tracked contract without exposing it", () => {
    const contract = {
      version: 1,
      production: {
        keyId: "prod-test-v1",
        secretSha256: TEST_TENANT_CONTEXT_SECRET_SHA256,
      },
      preview: {
        keyId: "preview-test-v1",
        secretSha256: "f".repeat(64),
      },
    };
    expect(() =>
      assertTenantContextCredentialContract({
        contract,
        expectedKeyId: "prod-test-v1",
        expectedSecretSha256: TEST_TENANT_CONTEXT_SECRET_SHA256,
        signingSecret: TEST_TENANT_CONTEXT_SECRET,
      }),
    ).not.toThrow();
    for (const mismatch of [
      { expectedKeyId: "prod-wrong-v1" },
      { expectedSecretSha256: "e".repeat(64) },
      { signingSecret: "B".repeat(43) },
    ]) {
      let message = "";
      try {
        assertTenantContextCredentialContract({
          contract,
          expectedKeyId: "prod-test-v1",
          expectedSecretSha256: TEST_TENANT_CONTEXT_SECRET_SHA256,
          signingSecret: TEST_TENANT_CONTEXT_SECRET,
          ...mismatch,
        });
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      expect(message).toContain("does not match the tracked contract");
      expect(message).not.toContain(TEST_TENANT_CONTEXT_SECRET);
    }
  });
});

describe("one-time package and protected workflow integration", () => {
  it("exposes only the dedicated manual command and never a normal deployment hook", () => {
    const workspace = resolve(__dirname, "../../../..");
    const rootPackage = JSON.parse(
      readFileSync(join(workspace, "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    const webPackage = JSON.parse(
      readFileSync(join(workspace, "apps/web/package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    expect(rootPackage.scripts["db:adopt:legacy-production"]).toBe(
      "pnpm --filter @school-sis/web run db:adopt:legacy-production",
    );
    expect(webPackage.scripts["db:adopt:legacy-production"]).toBe(
      "tsx scripts/adopt-legacy-production-ledger.ts",
    );
    for (const [name, command] of Object.entries(rootPackage.scripts)) {
      if (name !== "db:adopt:legacy-production") {
        expect(command).not.toContain("db:adopt:legacy-production");
      }
    }
  });

  it("keeps adoption dispatch-only, snapshot-under-lock, and separate from deploy", () => {
    const workspace = resolve(__dirname, "../../../..");
    const workflow = readFileSync(
      resolve(
        __dirname,
        "../../../../.github/workflows/adopt-legacy-production.yml",
      ),
      "utf8",
    );
    const productionWorkflow = readFileSync(
      join(workspace, ".github/workflows/deploy-production.yml"),
      "utf8",
    );
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("group: production-release");
    expect(workflow).toContain("pull-requests: read");
    expect(workflow).toContain(
      "LEGACY_LEDGER_ADOPTION_EXPECTED_TENANT_CONTEXT_KEY_ID: ${{ vars.TENANT_CONTEXT_SIGNING_KEY_ID }}",
    );
    expect(workflow).toContain(
      "LEGACY_LEDGER_ADOPTION_EXPECTED_TENANT_CONTEXT_SECRET_SHA256: ${{ vars.PRODUCTION_TENANT_CONTEXT_SIGNING_SECRET_SHA256 }}",
    );
    expect(workflow).toContain(
      "LEGACY_LEDGER_ADOPTION_TENANT_CONTEXT_SIGNING_SECRET: ${{ secrets.TENANT_CONTEXT_SIGNING_SECRET }}",
    );
    expect(workflow).toContain(
      "docs/devops/evidence/legacy-production-transition-target-v2.json",
    );
    expect(workflow).toContain(SOURCE_EVIDENCE_ARTIFACT_FILENAME);
    expect(workflow).toContain(
      "LEGACY_LEDGER_ADOPTION_SOURCE_EVIDENCE_ARTIFACT_PATH",
    );
    expect(workflow).toContain(
      "LEGACY_LEDGER_ADOPTION_TARGET_EVIDENCE_ARTIFACT_PATH",
    );
    expect(workflow).toContain("pnpm --silent db:adopt:legacy-production");
    expect(workflow).toContain(
      "CREATE_AND_RETAIN_HEAD_SNAPSHOT_UNDER_ADOPTION_WRITE_FREEZE",
    );
    expect(workflow).toContain("attest_restore_drill_and_same_run_snapshot");
    expect(workflow).toContain(RESTORE_DRILL_ATTESTATION);
    expect(workflow).toContain('repository_owner="${GITHUB_REPOSITORY%%/*}"');
    expect(workflow).toContain('solo_release_owner="$repository_owner"');
    expect(workflow).not.toContain("actions/variables/SOLO_RELEASE_OWNER");
    expect(workflow).toContain('[ "$GITHUB_ACTOR" != "$repository_owner" ]');
    expect(workflow).toContain(
      '[ "$GITHUB_TRIGGERING_ACTOR" != "$repository_owner" ]',
    );
    expect(workflow).toContain(".merge_commit_sha == $sha");
    expect(workflow).toContain(".user.login == $owner");
    expect(workflow).toContain(".head.repo.full_name == env.GITHUB_REPOSITORY");
    expect(workflow).toContain("commits/${TARGET_SHA}/pulls?per_page=100");
    expect(workflow).toContain(
      "collaborators/${solo_release_owner}/permission",
    );
    expect(workflow).toContain("collaborators?affiliation=all&per_page=100");
    expect(workflow).toContain(".permissions.push == true");
    expect(workflow).toContain("($push_capable | length) == 1");
    expect(workflow).toContain('.permission == "admin"');
    expect(workflow).not.toContain("/reviews?per_page=100");
    expect(workflow).not.toContain("approved_reviewer");
    expect(workflow).toContain('GITHUB_RUN_ATTEMPT:-}" != "1"');
    expect(workflow).not.toContain("--request POST");
    expect(workflow).not.toContain("/snapshot?name=");
    expect(workflow).not.toMatch(
      /^\s+(?:push|pull_request|workflow_run|schedule):/m,
    );
    expect(workflow).not.toContain("db:migrate:deploy");
    expect(workflow).not.toContain("vercel deploy");
    expect(workflow).not.toContain("expires_at=");
    expect(workflow).not.toContain("timestamp=");
    expect(workflow).not.toContain("lsn=");
    expect(workflow).toContain(
      "after cancelling the initial Production Release at its production-environment gate",
    );
    expect(productionWorkflow).toContain("group: production-release");
    expect(productionWorkflow).toContain("environment: production");
    expect(productionWorkflow.indexOf("environment: production")).toBeLessThan(
      productionWorkflow.indexOf(
        "Create and verify Free-tier recovery branch checkpoint",
      ),
    );
  });

  it("documents the one-time release sequence, durable evidence, and restore limitation", () => {
    const runbook = readFileSync(
      resolve(__dirname, "../../../../docs/devops/README.md"),
      "utf8",
    );
    expect(runbook).toContain("## One-time legacy production ledger adoption");
    expect(runbook).toContain("Do not run that package command by hand");
    expect(runbook).toContain("Cancel or decline it");
    expect(runbook).toContain("gh run rerun <production-release-run-id>");
    expect(runbook).toContain("Freeze provider/IAM changes and manual DDL");
    expect(runbook).toMatch(/does \*\*not\*\* by\s+itself prove restorability/);
    expect(runbook).toContain("raw live source audit, tracked target audit");
    expect(runbook).toMatch(/retained for\s+90 days/);
    expect(runbook).toMatch(/never\s+restores production automatically/);
  });
});

describe("adoption approval envelope and production connection", () => {
  it("pins the reviewed source and exact canonical-runner transition target", () => {
    expect(REVIEWED_FORWARD_RECONCILIATION).toEqual({
      disposition: "FORWARD_RECONCILIATION_0001_REVIEWED",
      sourceEvidenceFingerprint:
        "626de193383d16680e1c53f3b251645518dc1180174b6d0941c540bf6ff67a27",
      sourceSchemaFingerprint:
        "dec34f08a27b074812b7166c0b4df8100afcac0d5f752f195bd2134b1984585d",
      targetEvidenceArtifactSha256:
        "b4fa27f1d4a1ce43ce3b94935e2533873143ebfbc290ce91bd7606ee4c6ffe72",
      targetEvidenceFingerprint:
        "ff046c96179bfac26313a1abfe40e4600712bf1248f0eba67968bfdfa793ce3e",
      targetSchemaFingerprint:
        "f58500dc0b7cc63c8781e8e082cab05b7bf14034be933121a1c5e58bd47779e9",
    });
    const artifact = readFileSync(
      resolve(
        __dirname,
        "../../../../docs/devops/evidence/legacy-production-transition-target-v2.json",
      ),
    );
    expect(createHash("sha256").update(artifact).digest("hex")).toBe(
      REVIEWED_FORWARD_RECONCILIATION.targetEvidenceArtifactSha256,
    );
    expect(() =>
      assertTargetReconciliationEvidence(
        JSON.parse(artifact.toString("utf8")),
        resolveAdoptionConfiguration(adoptionEnvironment(), NOW),
      ),
    ).not.toThrow();
  });

  it("requires coherent GitHub, Neon, snapshot, evidence, and TLS identity", () => {
    const environment = adoptionEnvironment();
    const configuration = resolveAdoptionConfiguration(environment, NOW);
    expect(configuration).toMatchObject({
      expectedBranchId: "br-hidden-union-ao8rd4ha",
      expectedDatabase: "neondb",
      expectedHost: DIRECT_HOST,
      expectedProjectId: "wispy-leaf-40556376",
      expectedRole: "neondb_owner",
      ssl: { rejectUnauthorized: true },
    });
    expect(configuration.connectionString).not.toContain("sslmode");
  });

  it("binds the exact deterministic snapshot name without a committed snapshot ID", () => {
    const environment = adoptionEnvironment();
    expect(resolveAdoptionConfiguration(environment, NOW)).toMatchObject({
      snapshotName: "legacy-adoption-aaaaaaaaaaaa-123456789",
    });
    environment[ADOPTION_ENV.snapshotName] = "legacy-adoption-wrong-run";
    expect(() =>
      computeAdoptionApprovalFingerprintFromEnvironment(environment, NOW),
    ).toThrow("snapshot name is not exact");
  });

  it("refuses a rerun even when its run ID and approval envelope are unchanged", () => {
    const environment = adoptionEnvironment();
    environment.GITHUB_RUN_ATTEMPT = "2";
    expect(() =>
      computeAdoptionApprovalFingerprintFromEnvironment(environment, NOW),
    ).toThrow("refuses reruns");
  });

  it("requires the exact reviewed non-production snapshot restore-drill attestation", () => {
    const environment = adoptionEnvironment();
    environment[ADOPTION_ENV.restoreDrillAttestation] =
      "SNAPSHOT_METADATA_LOOKS_VALID";
    expect(() =>
      computeAdoptionApprovalFingerprintFromEnvironment(environment, NOW),
    ).toThrow("restore drill");
  });

  it("rechecks snapshot freshness and the bounded run deadline", () => {
    const material = {
      approvedAt: "2026-08-15T18:59:00.000Z",
    };
    const snapshot = recoverySnapshot();
    expect(() =>
      assertAdoptionTimingIsFresh(material, snapshot, NOW, NOW),
    ).not.toThrow();
    expect(() =>
      assertAdoptionTimingIsFresh(
        material,
        snapshot,
        NOW,
        new Date(NOW.getTime() + MAX_ADOPTION_RUN_DURATION_MS + 1),
      ),
    ).toThrow("bounded run window");
    expect(() =>
      assertAdoptionTimingIsFresh(
        material,
        snapshot,
        new Date("2026-08-15T19:59:00.001Z"),
        new Date("2026-08-15T19:59:00.001Z"),
      ),
    ).toThrow("snapshot is no longer fresh");
  });

  it.each([
    [
      "pooler",
      (environment: NodeJS.ProcessEnv) => {
        const pooled = DIRECT_HOST.replace(
          "ep-school-sis",
          "ep-school-sis-pooler",
        );
        environment[ADOPTION_ENV.expectedHost] = pooled;
        environment[ADOPTION_ENV.databaseUrl] =
          `postgresql://neondb_owner:secret@${pooled}/neondb` +
          "?sslmode=verify-full&channel_binding=require";
      },
    ],
    [
      "local database",
      (environment: NodeJS.ProcessEnv) => {
        environment[ADOPTION_ENV.expectedHost] = "127.0.0.1";
        environment[ADOPTION_ENV.databaseUrl] =
          "postgresql://neondb_owner:secret@127.0.0.1:5432/neondb" +
          "?sslmode=verify-full&channel_binding=require";
      },
    ],
    [
      "weak TLS",
      (environment: NodeJS.ProcessEnv) => {
        environment[ADOPTION_ENV.databaseUrl] = environment[
          ADOPTION_ENV.databaseUrl
        ]?.replace("sslmode=verify-full", "sslmode=require");
      },
    ],
    [
      "identity query override",
      (environment: NodeJS.ProcessEnv) => {
        environment[ADOPTION_ENV.databaseUrl] += "&host=localhost";
      },
    ],
    [
      "unprotected ref",
      (environment: NodeJS.ProcessEnv) => {
        environment.GITHUB_REF_PROTECTED = "false";
      },
    ],
    [
      "non-production branch",
      (environment: NodeJS.ProcessEnv) => {
        environment.GITHUB_REF = "refs/heads/fix/vercel-neon-cicd";
        environment.GITHUB_REF_NAME = "fix/vercel-neon-cicd";
      },
    ],
    [
      "unapproved actor",
      (environment: NodeJS.ProcessEnv) => {
        environment.GITHUB_ACTOR = "someone-else";
      },
    ],
  ])("rejects %s", (_label, mutate) => {
    const environment = adoptionEnvironment();
    mutate(environment);
    expect(() => resolveAdoptionConfiguration(environment, NOW)).toThrow();
  });

  it("rejects stale approval, mismatched envelope, and repeated evidence", () => {
    const stale = adoptionEnvironment();
    stale[ADOPTION_ENV.approvedAt] = "2026-08-14T11:30:00.000Z";
    expect(() => resolveAdoptionConfiguration(stale, NOW)).toThrow("too old");

    const staleSnapshot = adoptionEnvironment();
    expect(() =>
      resolveAdoptionConfiguration(
        staleSnapshot,
        new Date("2026-08-16T18:45:01.000Z"),
      ),
    ).toThrow("too old");

    const mismatched = adoptionEnvironment();
    mismatched[ADOPTION_ENV.snapshotConsoleUrl] += "?view=snapshot";
    expect(() => resolveAdoptionConfiguration(mismatched, NOW)).toThrow(
      "envelope fingerprint",
    );

    const wrongSnapshot = adoptionEnvironment();
    wrongSnapshot[ADOPTION_ENV.snapshotName] = "different-snapshot-name";
    expect(() => resolveAdoptionConfiguration(wrongSnapshot, NOW)).toThrow(
      "snapshot name is not exact",
    );

    const repeated = adoptionEnvironment();
    repeated[ADOPTION_ENV.targetEvidenceFingerprint] =
      repeated[ADOPTION_ENV.sourceEvidenceFingerprint];
    expect(() =>
      computeAdoptionApprovalFingerprintFromEnvironment(repeated, NOW),
    ).toThrow("independently fingerprinted");
  });

  it("rejects generic equivalence and any unreviewed fingerprint pair", () => {
    const equivalent = adoptionEnvironment();
    equivalent[ADOPTION_ENV.reconciliationDisposition] =
      "EXACT_SCHEMA_EQUIVALENCE_REVIEWED";
    expect(() =>
      computeAdoptionApprovalFingerprintFromEnvironment(equivalent, NOW),
    ).toThrow("one reviewed 0001 reconciliation");

    const unreviewed = adoptionEnvironment();
    unreviewed[ADOPTION_ENV.targetSchemaFingerprint] = "a".repeat(64);
    expect(() =>
      computeAdoptionApprovalFingerprintFromEnvironment(unreviewed, NOW),
    ).toThrow("not the pinned reviewed reconciliation value");

    const unreviewedArtifact = adoptionEnvironment();
    unreviewedArtifact[ADOPTION_ENV.targetEvidenceArtifactSha256] = "a".repeat(
      64,
    );
    expect(() =>
      computeAdoptionApprovalFingerprintFromEnvironment(
        unreviewedArtifact,
        NOW,
      ),
    ).toThrow("not the pinned reviewed reconciliation value");

    const sharedApplicationRole = adoptionEnvironment();
    sharedApplicationRole[ADOPTION_ENV.expectedPlatformRole] =
      "school_sis_runtime";
    expect(() =>
      computeAdoptionApprovalFingerprintFromEnvironment(
        sharedApplicationRole,
        NOW,
      ),
    ).toThrow("must be distinct");
  });
});

describe("provider and target-reference evidence", () => {
  function neonFetch(
    overrides: {
      branch?: Record<string, unknown>;
      endpoint?: Record<string, unknown>;
      snapshot?: Record<string, unknown>;
    } = {},
  ): typeof fetch {
    return (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/endpoints")) {
        return new Response(
          JSON.stringify({
            endpoints: [
              {
                branch_id: "br-hidden-union-ao8rd4ha",
                project_id: "wispy-leaf-40556376",
                type: "read_write",
                host: DIRECT_HOST,
                disabled: false,
                current_state: "active",
                pending_state: null,
                ...overrides.endpoint,
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/snapshots")) {
        return new Response(
          JSON.stringify({
            snapshots: [
              {
                id: "snap-same-run-recovery",
                source_branch_id: "br-hidden-union-ao8rd4ha",
                manual: true,
                created_at: "2026-08-15T18:58:00Z",
                full_size: 39665664,
                name: "legacy-adoption-aaaaaaaaaaaa-123456789",
                ...overrides.snapshot,
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          branch: {
            id: "br-hidden-union-ao8rd4ha",
            project_id: "wispy-leaf-40556376",
            default: true,
            protected: false,
            current_state: "ready",
            pending_state: null,
            ...overrides.branch,
          },
        }),
        { status: 200 },
      );
    }) as typeof fetch;
  }

  it("binds the direct host and same-run manual snapshot to the reviewed root branch", async () => {
    expect(REVIEWED_PRODUCTION_IDENTITY).toEqual({
      branchId: "br-hidden-union-ao8rd4ha",
      ownerRole: "neondb_owner",
      platformRole: "school_sis_platform",
      projectId: "wispy-leaf-40556376",
      runtimeRole: "school_sis_runtime",
    });
    const configuration = resolveAdoptionConfiguration(
      adoptionEnvironment(),
      NOW,
    );
    await expect(
      verifyNeonProviderIdentity(
        configuration,
        "neon-api-key-never-logged",
        neonFetch(),
        recoverySnapshot(),
      ),
    ).resolves.toBeUndefined();
  });

  it("creates the deterministic HEAD snapshot exactly once and verifies its operation and list record", async () => {
    const configuration = resolveAdoptionConfiguration(
      adoptionEnvironment(),
      NOW,
    );
    const requests: Array<{ method: string; url: string }> = [];
    const snapshotFetch = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      requests.push({ method, url });
      if (method === "POST") {
        return new Response(
          JSON.stringify({
            snapshot: {
              id: "snap-same-run-recovery",
              name: configuration.snapshotName,
              source_branch_id: configuration.expectedBranchId,
              manual: true,
            },
            operations: [{ id: "op_snapshot_1" }],
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/operations/op_snapshot_1")) {
        return new Response(
          JSON.stringify({ operation: { status: "finished" } }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          snapshots: [
            {
              created_at: "2026-08-15T18:58:00Z",
              full_size: 39665664,
              id: "snap-same-run-recovery",
              manual: true,
              name: configuration.snapshotName,
              source_branch_id: configuration.expectedBranchId,
            },
          ],
        }),
        { status: 200 },
      );
    }) as typeof fetch;
    await expect(
      createNeonRecoverySnapshotUnderWriteFreeze(
        configuration,
        "neon-api-key-never-logged",
        snapshotFetch,
      ),
    ).resolves.toEqual(recoverySnapshot());
    expect(
      requests.filter((request) => request.method === "POST"),
    ).toHaveLength(1);
    expect(requests[0]?.url).toContain(
      `/snapshot?name=${encodeURIComponent(configuration.snapshotName)}`,
    );
    expect(requests[0]?.url).not.toMatch(/[?&](?:timestamp|lsn|expires_at)=/);
  });

  it("never retries an ambiguous snapshot POST", async () => {
    const configuration = resolveAdoptionConfiguration(
      adoptionEnvironment(),
      NOW,
    );
    let postCount = 0;
    const ambiguousFetch = (async (
      _input: string | URL | Request,
      init?: RequestInit,
    ) => {
      if (init?.method === "POST") postCount += 1;
      throw new Error("injected transport loss");
    }) as typeof fetch;
    await expect(
      createNeonRecoverySnapshotUnderWriteFreeze(
        configuration,
        "neon-api-key-never-logged",
        ambiguousFetch,
      ),
    ).rejects.toThrow("ambiguous transport outcome");
    expect(postCount).toBe(1);
  });

  it("rejects provider identity or snapshot ambiguity", async () => {
    const configuration = resolveAdoptionConfiguration(
      adoptionEnvironment(),
      NOW,
    );
    await expect(
      verifyNeonProviderIdentity(
        configuration,
        "secret",
        neonFetch({ endpoint: { host: "ep-wrong.aws.neon.tech" } }),
        recoverySnapshot(),
      ),
    ).rejects.toThrow("approved direct host");
    await expect(
      verifyNeonProviderIdentity(
        configuration,
        "secret",
        neonFetch({ snapshot: { created_at: null } }),
        recoverySnapshot(),
      ),
    ).rejects.toThrow("metadata is malformed");
    await expect(
      verifyNeonProviderIdentity(
        configuration,
        "secret",
        neonFetch({ snapshot: { full_size: 987654321 } }),
        recoverySnapshot(),
      ),
    ).rejects.toThrow("metadata changed");
    await expect(
      verifyNeonProviderIdentity(
        configuration,
        "secret",
        neonFetch({ snapshot: { lsn: "0/16B6C50" } }),
        recoverySnapshot(),
      ),
    ).rejects.toThrow("unapproved or unverifiable field set");
    await expect(
      verifyNeonProviderIdentity(
        configuration,
        "secret",
        neonFetch({ branch: { parent_id: "br-parent" } }),
        recoverySnapshot(),
      ),
    ).rejects.toThrow("default root");
    await expect(
      verifyNeonProviderIdentity(
        configuration,
        "secret",
        neonFetch({ branch: { protected: true } }),
        recoverySnapshot(),
      ),
    ).rejects.toThrow("unprotected default root");
    await expect(
      verifyNeonProviderIdentity(
        configuration,
        "secret",
        neonFetch({ branch: { current_state: "initializing" } }),
        recoverySnapshot(),
      ),
    ).rejects.toThrow("unprotected default root");
    await expect(
      verifyNeonProviderIdentity(
        configuration,
        "secret",
        neonFetch({ endpoint: { disabled: true } }),
        recoverySnapshot(),
      ),
    ).rejects.toThrow("approved direct host");
  });

  it("rechecks the protected-main SHA and current dispatch through GitHub", async () => {
    const configuration = resolveAdoptionConfiguration(
      adoptionEnvironment(),
      NOW,
    );
    const githubFetch = (
      overrides: {
        branch?: Record<string, unknown>;
        run?: Record<string, unknown>;
      } = {},
    ) =>
      (async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith("/branches/main")) {
          return new Response(
            JSON.stringify({
              name: "main",
              protected: true,
              commit: { sha: "a".repeat(40) },
              ...overrides.branch,
            }),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify({
            id: 123456789,
            event: "workflow_dispatch",
            run_attempt: 1,
            status: "in_progress",
            path: ".github/workflows/adopt-legacy-production.yml",
            head_branch: "main",
            head_sha: "a".repeat(40),
            actor: { login: "singhaditya21" },
            triggering_actor: { login: "singhaditya21" },
            ...overrides.run,
          }),
          { status: 200 },
        );
      }) as typeof fetch;
    await expect(
      verifyGitHubProtectedMain(
        configuration,
        "github-token-never-logged",
        githubFetch(),
      ),
    ).resolves.toBeUndefined();
    await expect(
      verifyGitHubProtectedMain(
        configuration,
        "github-token-never-logged",
        githubFetch({
          branch: { commit: { sha: "b".repeat(40) } },
        }),
      ),
    ).rejects.toThrow("protected main");
    await expect(
      verifyGitHubProtectedMain(
        configuration,
        "github-token-never-logged",
        githubFetch({ run: { status: "completed" } }),
      ),
    ).rejects.toThrow("one-time workflow run");
    await expect(
      verifyGitHubProtectedMain(
        configuration,
        "github-token-never-logged",
        githubFetch({ run: { run_attempt: 2 } }),
      ),
    ).rejects.toThrow("one-time workflow run");
  });

  it("rebuilds every target report fingerprint and checks canonical-runner target structure", () => {
    const report = targetReconciliationReport();
    const configuration = configurationForTargetReport(report);
    expect(() =>
      assertTargetReconciliationEvidence(report, configuration),
    ).not.toThrow();

    const unsigned = structuredClone(report);
    unsigned.schema.sections.extensions.rows =
      unsigned.schema.sections.extensions.rows.filter(
        (extension) => extension.name !== "pgcrypto",
      );
    const internallyConsistentUnsigned = buildReconciliationCatalogReport({
      catalogRows: Object.fromEntries(
        Object.entries(unsigned.schema.sections).map(([name, section]) => [
          name,
          section.rows,
        ]),
      ) as Parameters<
        typeof buildReconciliationCatalogReport
      >[0]["catalogRows"],
      ledgerEntries: unsigned.ledger.entries.map((entry) => ({
        created_at: entry.createdAt,
        hash: entry.hash,
      })),
      ledgerExists: true,
    });
    expect(() =>
      assertTargetReconciliationEvidence(
        internallyConsistentUnsigned,
        configurationForTargetReport(internallyConsistentUnsigned),
      ),
    ).toThrow("reviewed pgcrypto extension");

    const targetWithoutPostgres18NotNullConstraints = structuredClone(report);
    targetWithoutPostgres18NotNullConstraints.schema.sections.constraints.rows =
      targetWithoutPostgres18NotNullConstraints.schema.sections.constraints.rows.filter(
        (constraint) =>
          constraint.schema !== "app_private" || constraint.type !== "n",
      );
    const internallyConsistentTargetWithoutPostgres18NotNullConstraints =
      buildReconciliationCatalogReport({
        catalogRows: Object.fromEntries(
          Object.entries(
            targetWithoutPostgres18NotNullConstraints.schema.sections,
          ).map(([name, section]) => [name, section.rows]),
        ) as Parameters<
          typeof buildReconciliationCatalogReport
        >[0]["catalogRows"],
        ledgerEntries:
          targetWithoutPostgres18NotNullConstraints.ledger.entries.map(
            (entry) => ({
              created_at: entry.createdAt,
              hash: entry.hash,
            }),
          ),
        ledgerExists: true,
      });
    expect(() =>
      assertTargetReconciliationEvidence(
        internallyConsistentTargetWithoutPostgres18NotNullConstraints,
        configurationForTargetReport(
          internallyConsistentTargetWithoutPostgres18NotNullConstraints,
        ),
      ),
    ).not.toThrow();

    const targetWithNullablePrivateColumn = structuredClone(report);
    const privateSecretColumn =
      targetWithNullablePrivateColumn.schema.sections.columns.rows.find(
        (column) =>
          column.schema === "app_private" &&
          column.relation === "tenant_context_signing_keys" &&
          column.name === "secret",
      );
    privateSecretColumn!.notNull = false;
    const internallyConsistentTargetWithNullablePrivateColumn =
      buildReconciliationCatalogReport({
        catalogRows: Object.fromEntries(
          Object.entries(targetWithNullablePrivateColumn.schema.sections).map(
            ([name, section]) => [name, section.rows],
          ),
        ) as Parameters<
          typeof buildReconciliationCatalogReport
        >[0]["catalogRows"],
        ledgerEntries: targetWithNullablePrivateColumn.ledger.entries.map(
          (entry) => ({
            created_at: entry.createdAt,
            hash: entry.hash,
          }),
        ),
        ledgerExists: true,
      });
    expect(() =>
      assertTargetReconciliationEvidence(
        internallyConsistentTargetWithNullablePrivateColumn,
        configurationForTargetReport(
          internallyConsistentTargetWithNullablePrivateColumn,
        ),
      ),
    ).toThrow(
      "Target private table tenant_context_signing_keys columns are not exact",
    );

    const writablePrivateState = structuredClone(report);
    const signingKeys =
      writablePrivateState.schema.sections.relations.rows.find(
        (relation) =>
          relation.schema === "app_private" &&
          relation.name === "tenant_context_signing_keys",
      );
    signingKeys!.acl.push({
      grantable: false,
      grantee: "school_sis_runtime",
      grantor: "neondb_owner",
      privilege: "SELECT",
    });
    const internallyConsistentWritableState = buildReconciliationCatalogReport({
      catalogRows: Object.fromEntries(
        Object.entries(writablePrivateState.schema.sections).map(
          ([name, section]) => [name, section.rows],
        ),
      ) as Parameters<
        typeof buildReconciliationCatalogReport
      >[0]["catalogRows"],
      ledgerEntries: writablePrivateState.ledger.entries.map((entry) => ({
        created_at: entry.createdAt,
        hash: entry.hash,
      })),
      ledgerExists: true,
    });
    expect(() =>
      assertTargetReconciliationEvidence(
        internallyConsistentWritableState,
        configurationForTargetReport(internallyConsistentWritableState),
      ),
    ).toThrow("Target private table tenant_context_signing_keys ACL");

    const helperWithUnsafeConfiguration = structuredClone(report);
    const constantTimeHelper =
      helperWithUnsafeConfiguration.schema.sections.functions.rows.find(
        (helper) => helper.name === "constant_time_equal_32",
      );
    constantTimeHelper!.configuration = null;
    const internallyConsistentUnsafeHelper = buildReconciliationCatalogReport({
      catalogRows: Object.fromEntries(
        Object.entries(helperWithUnsafeConfiguration.schema.sections).map(
          ([name, section]) => [name, section.rows],
        ),
      ) as Parameters<
        typeof buildReconciliationCatalogReport
      >[0]["catalogRows"],
      ledgerEntries: helperWithUnsafeConfiguration.ledger.entries.map(
        (entry) => ({
          created_at: entry.createdAt,
          hash: entry.hash,
        }),
      ),
      ledgerExists: true,
    });
    expect(() =>
      assertTargetReconciliationEvidence(
        internallyConsistentUnsafeHelper,
        configurationForTargetReport(internallyConsistentUnsafeHelper),
      ),
    ).toThrow("Target helper constant_time_equal_32 is not exact");

    const tampered = structuredClone(report);
    const publicRelation = tampered.schema.sections.relations.rows.find(
      (relation) => relation.schema === "public",
    );
    publicRelation!.forceRowSecurity = false;
    expect(() =>
      assertTargetReconciliationEvidence(tampered, configuration),
    ).toThrow("exact approved canonical-runner target");

    const unready = structuredClone(report);
    const publicIndex = unready.schema.sections.indexes.rows.find(
      (index) => index.schema === "public",
    );
    publicIndex!.ready = false;
    const internallyConsistentConfiguration = configurationForTargetReport(
      buildReconciliationCatalogReport({
        catalogRows: Object.fromEntries(
          Object.entries(unready.schema.sections).map(([name, section]) => [
            name,
            section.rows,
          ]),
        ) as Parameters<
          typeof buildReconciliationCatalogReport
        >[0]["catalogRows"],
        ledgerEntries: unready.ledger.entries.map((entry) => ({
          created_at: entry.createdAt,
          hash: entry.hash,
        })),
        ledgerExists: true,
      }),
    );
    expect(() =>
      assertTargetReconciliationEvidence(
        buildReconciliationCatalogReport({
          catalogRows: Object.fromEntries(
            Object.entries(unready.schema.sections).map(([name, section]) => [
              name,
              section.rows,
            ]),
          ) as Parameters<
            typeof buildReconciliationCatalogReport
          >[0]["catalogRows"],
          ledgerEntries: unready.ledger.entries.map((entry) => ({
            created_at: entry.createdAt,
            hash: entry.hash,
          })),
          ledgerExists: true,
        }),
        internallyConsistentConfiguration,
      ),
    ).toThrow("invalid catalog objects");
  });

  it("accepts only a SHA-pinned regular target artifact inside RUNNER_TEMP", () => {
    const report = targetReconciliationReport();
    const bytes = Buffer.from(JSON.stringify(report));
    const directory = mkdtempSync(
      join(tmpdir(), "school-sis-adoption-evidence-"),
    );
    const artifactPath = join(directory, "current-baseline.json");
    writeFileSync(artifactPath, bytes, { flag: "wx", mode: 0o600 });
    try {
      const configuration = {
        ...configurationForTargetReport(report),
        targetEvidenceArtifactPath: artifactPath,
        targetEvidenceArtifactSha256: createHash("sha256")
          .update(bytes)
          .digest("hex"),
      };
      expect(() =>
        loadAndAssertTargetReconciliationEvidence(configuration, {
          RUNNER_TEMP: directory,
        }),
      ).not.toThrow();
      expect(() =>
        loadAndAssertTargetReconciliationEvidence(
          { ...configuration, targetEvidenceArtifactSha256: "a".repeat(64) },
          { RUNNER_TEMP: directory },
        ),
      ).toThrow("SHA-256");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("writes the canonical live source audit privately and exactly once inside RUNNER_TEMP", () => {
    const directory = mkdtempSync(
      join(tmpdir(), "school-sis-adoption-source-evidence-"),
    );
    try {
      const report = targetReconciliationReport();
      const artifact = writeSourceReconciliationEvidenceArtifact(report, {
        RUNNER_TEMP: directory,
      });
      const bytes = readFileSync(artifact.path);
      expect(artifact.path).toBe(
        join(realpathSync(directory), SOURCE_EVIDENCE_ARTIFACT_FILENAME),
      );
      expect(JSON.parse(bytes.toString("utf8"))).toEqual(report);
      expect(artifact).toMatchObject({
        byteLength: bytes.byteLength,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
      expect(() =>
        writeSourceReconciliationEvidenceArtifact(report, {
          RUNNER_TEMP: directory,
        }),
      ).toThrow("exactly once");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe("complete adoption runner transaction", () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function runnerEnvironment(): NodeJS.ProcessEnv {
    return {
      ...adoptionEnvironment(),
      GITHUB_TOKEN: "github-token-never-logged",
      GITHUB_WORKSPACE: resolve(__dirname, "../../../.."),
      RUNNER_TEMP: tmpdir(),
      [ADOPTION_ENV.neonApiKey]: "neon-api-key-never-logged",
    };
  }

  const fakeSourceEvidenceArtifact = () => ({
    byteLength: 1_024,
    path: join(tmpdir(), SOURCE_EVIDENCE_ARTIFACT_FILENAME),
    sha256: "c".repeat(64),
  });

  function fakeClient(
    options: {
      failInsert?: boolean;
      failMutationCommit?: boolean;
      offerChannelBinding?: boolean;
      refuseUnlock?: boolean;
    } = {},
  ) {
    const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
    let transaction: "none" | "readonly" | "serializable" = "none";
    let commitCount = 0;
    let inserted = false;
    const legacyRows = EXACT_LEGACY_LEDGER.map((entry, index) => ({
      id: index + 1,
      created_at: entry.createdAt,
      hash: entry.hash,
    }));
    const connection = new EventEmitter();
    const client = {
      connection,
      enableChannelBinding: true,
      async connect() {
        connection.emit("authenticationSASL", {
          mechanisms:
            options.offerChannelBinding === false
              ? ["SCRAM-SHA-256"]
              : ["SCRAM-SHA-256-PLUS", "SCRAM-SHA-256"],
        });
      },
      async end() {},
      async query(text: string, values?: readonly unknown[]) {
        const normalized = text.replace(/\s+/g, " ").trim();
        queries.push({ text: normalized, values });
        if (normalized.startsWith("BEGIN ISOLATION LEVEL REPEATABLE READ")) {
          transaction = "readonly";
          return { rows: [] };
        }
        if (normalized.startsWith("BEGIN ISOLATION LEVEL SERIALIZABLE")) {
          transaction = "serializable";
          return { rows: [] };
        }
        if (normalized === "COMMIT") {
          commitCount += 1;
          transaction = "none";
          if (options.failMutationCommit && commitCount === 2) {
            throw new Error("injected lost commit acknowledgement");
          }
          return { rows: [] };
        }
        if (normalized === "ROLLBACK") {
          transaction = "none";
          return { rows: [] };
        }
        if (normalized.includes("pg_try_advisory_lock")) {
          return { rows: [{ acquired: true }] };
        }
        if (normalized.includes("pg_advisory_unlock")) {
          return { rows: [{ released: options.refuseUnlock !== true }] };
        }
        if (normalized.includes("migration_owner_can_signal_backends")) {
          return {
            rows: [{ migration_owner_can_signal_backends: true }],
          };
        }
        if (normalized.includes("current_setting('transaction_isolation')")) {
          return {
            rows: [
              {
                isolation:
                  transaction === "readonly"
                    ? "repeatable read"
                    : "serializable",
                read_only: transaction === "readonly" ? "on" : "off",
              },
            ],
          };
        }
        if (
          normalized.startsWith("SELECT id, created_at, hash") &&
          normalized.endsWith("FOR UPDATE")
        ) {
          return { rows: legacyRows };
        }
        if (normalized.startsWith("DELETE FROM drizzle.__drizzle_migrations")) {
          return { rows: legacyRows };
        }
        if (normalized.startsWith("INSERT INTO drizzle.__drizzle_migrations")) {
          if (options.failInsert) throw new Error("injected insert failure");
          inserted = true;
          return { rows: [] };
        }
        if (
          normalized.startsWith("SELECT id, created_at, hash") &&
          !normalized.endsWith("FOR UPDATE")
        ) {
          const { baseline } = resolveCurrentBaseline();
          return {
            rows: inserted
              ? [{ id: 1, created_at: baseline.createdAt, hash: baseline.hash }]
              : legacyRows,
          };
        }
        return { rows: [] };
      },
    };
    return { client, queries };
  }

  it("locks both migration lanes, rechecks evidence, commits once, and unlocks", async () => {
    const environment = runnerEnvironment();
    const configuration = resolveAdoptionConfiguration(environment, NOW);
    const { client, queries } = fakeClient();
    let githubChecks = 0;
    let providerChecks = 0;
    let providerSnapshotChecks = 0;
    let snapshotCreates = 0;
    let sourceEvidenceWrites = 0;
    let targetChecks = 0;
    let evidenceChecks = 0;
    let transitionInputChecks = 0;
    let clientOptions: Record<string, unknown> | undefined;
    const result = await runLegacyProductionLedgerAdoption(
      environment,
      (options) => {
        clientOptions = options as unknown as Record<string, unknown>;
        return client as unknown as Client;
      },
      fetch,
      {
        collectCatalog: async () => approvedSourceEvidence(configuration).audit,
        collectEvidence: async () => {
          evidenceChecks += 1;
          return evidenceChecks === 3
            ? approvedPostAdoptionEvidence(configuration)
            : approvedSourceEvidence(configuration);
        },
        createSnapshot: async () => {
          snapshotCreates += 1;
          expect(
            queries.some((query) =>
              query.text.endsWith("IN SHARE ROW EXCLUSIVE MODE"),
            ),
          ).toBe(true);
          expect(
            queries.some((query) =>
              query.text.startsWith("DELETE FROM drizzle.__drizzle_migrations"),
            ),
          ).toBe(false);
          return recoverySnapshot();
        },
        verifyGitHub: async () => {
          githubChecks += 1;
        },
        verifyAdoptionFiles: () => {
          transitionInputChecks += 1;
        },
        verifyProvider: async (_configuration, _apiKey, _fetch, snapshot) => {
          providerChecks += 1;
          if (snapshot) {
            providerSnapshotChecks += 1;
            if (providerSnapshotChecks === 1) {
              expect(
                queries.some((query) =>
                  query.text.startsWith(
                    "DELETE FROM drizzle.__drizzle_migrations",
                  ),
                ),
              ).toBe(false);
            }
          }
        },
        verifyLedgerContract: async () => undefined,
        verifyTargetArtifact: () => {
          targetChecks += 1;
          return targetReconciliationReport();
        },
        writeSourceEvidence: (report) => {
          sourceEvidenceWrites += 1;
          expect(report.schema.fingerprint).toBe(
            configuration.sourceSchemaFingerprint,
          );
          expect(
            queries.filter((query) => query.text === "COMMIT"),
          ).toHaveLength(1);
          expect(
            queries.some((query) =>
              query.text.startsWith("DELETE FROM drizzle.__drizzle_migrations"),
            ),
          ).toBe(false);
          return fakeSourceEvidenceArtifact();
        },
      },
    );
    expect(result).toMatchObject({
      advisoryLockCleanup: "confirmed",
      status: "adopted",
      pendingMigration: "0001_reconcile_production_integrity",
      reconciliationDisposition: "FORWARD_RECONCILIATION_0001_REVIEWED",
      sourceEvidenceArtifactSha256: "c".repeat(64),
    });
    expect(clientOptions?.enableChannelBinding).toBe(true);
    expect(githubChecks).toBe(5);
    expect(providerChecks).toBe(5);
    expect(providerSnapshotChecks).toBe(3);
    expect(snapshotCreates).toBe(1);
    expect(targetChecks).toBe(1);
    expect(sourceEvidenceWrites).toBe(1);
    expect(evidenceChecks).toBe(3);
    expect(transitionInputChecks).toBe(3);
    expect(
      queries.filter((query) =>
        query.text.includes("migration_owner_can_signal_backends"),
      ),
    ).toHaveLength(2);
    const acquiredLocks = queries
      .filter((query) => query.text.includes("pg_try_advisory_lock"))
      .map((query) => query.values?.[0]);
    expect(acquiredLocks).toEqual([
      LEGACY_LEDGER_ADVISORY_LOCK,
      DEPLOYMENT_MIGRATION_LOCK_NAME,
    ]);
    expect(
      queries.filter((query) => query.text.includes("pg_advisory_unlock")),
    ).toHaveLength(2);
    const serializableBegin = queries.findIndex((query) =>
      query.text.startsWith("BEGIN ISOLATION LEVEL SERIALIZABLE"),
    );
    const ledgerLock = queries.findIndex((query) =>
      query.text.startsWith("LOCK TABLE drizzle.__drizzle_migrations"),
    );
    const publicTableLock = queries.findIndex(
      (query) =>
        query.text.startsWith('LOCK TABLE "public".') &&
        query.text.endsWith("IN SHARE ROW EXCLUSIVE MODE"),
    );
    const serializableModeCheck = queries.findIndex(
      (query, index) =>
        index > serializableBegin &&
        query.text.includes("current_setting('transaction_isolation')"),
    );
    expect(ledgerLock).toBeGreaterThan(serializableBegin);
    expect(publicTableLock).toBeGreaterThan(ledgerLock);
    expect(publicTableLock).toBeLessThan(serializableModeCheck);
    expect(ledgerLock).toBeLessThan(serializableModeCheck);
    expect(queries.filter((query) => query.text === "COMMIT")).toHaveLength(2);
    expect(queries.filter((query) => query.text === "ROLLBACK")).toHaveLength(
      1,
    );
  });

  it("rolls back and releases both locks if the ledger insert fails", async () => {
    const environment = runnerEnvironment();
    const configuration = resolveAdoptionConfiguration(environment, NOW);
    const { client, queries } = fakeClient({ failInsert: true });
    await expect(
      runLegacyProductionLedgerAdoption(
        environment,
        () => client as unknown as Client,
        fetch,
        {
          collectCatalog: async () =>
            approvedSourceEvidence(configuration).audit,
          collectEvidence: async () => approvedSourceEvidence(configuration),
          createSnapshot: async () => recoverySnapshot(),
          verifyLedgerContract: async () => undefined,
          verifyGitHub: async () => undefined,
          verifyAdoptionFiles: () => undefined,
          verifyProvider: async () => undefined,
          verifyTargetArtifact: () => targetReconciliationReport(),
          writeSourceEvidence: fakeSourceEvidenceArtifact,
        },
      ),
    ).rejects.toThrow("injected insert failure");
    expect(queries.some((query) => query.text === "ROLLBACK")).toBe(true);
    expect(
      queries.filter((query) => query.text.includes("pg_advisory_unlock")),
    ).toHaveLength(2);
  });

  it("expires before any ledger write when the bounded run window elapses", async () => {
    const environment = runnerEnvironment();
    const configuration = resolveAdoptionConfiguration(environment, NOW);
    const { client, queries } = fakeClient();
    let evidenceChecks = 0;
    await expect(
      runLegacyProductionLedgerAdoption(
        environment,
        () => client as unknown as Client,
        fetch,
        {
          collectCatalog: async () =>
            approvedSourceEvidence(configuration).audit,
          collectEvidence: async () => {
            evidenceChecks += 1;
            if (evidenceChecks === 2) {
              jest.advanceTimersByTime(MAX_ADOPTION_RUN_DURATION_MS + 1);
            }
            return approvedSourceEvidence(configuration);
          },
          createSnapshot: async () => recoverySnapshot(),
          verifyLedgerContract: async () => undefined,
          verifyGitHub: async () => undefined,
          verifyAdoptionFiles: () => undefined,
          verifyProvider: async () => undefined,
          verifyTargetArtifact: () => targetReconciliationReport(),
          writeSourceEvidence: fakeSourceEvidenceArtifact,
        },
      ),
    ).rejects.toThrow("bounded run window");
    expect(
      queries.some((query) =>
        query.text.startsWith("DELETE FROM drizzle.__drizzle_migrations"),
      ),
    ).toBe(false);
    expect(queries.filter((query) => query.text === "COMMIT")).toHaveLength(1);
    expect(queries.some((query) => query.text === "ROLLBACK")).toBe(true);
  });

  it("rolls back the ledger swap if the bounded run window elapses before COMMIT", async () => {
    const environment = runnerEnvironment();
    const configuration = resolveAdoptionConfiguration(environment, NOW);
    const { client, queries } = fakeClient();
    await expect(
      runLegacyProductionLedgerAdoption(
        environment,
        () => client as unknown as Client,
        fetch,
        {
          collectCatalog: async () =>
            approvedSourceEvidence(configuration).audit,
          collectEvidence: async () => approvedSourceEvidence(configuration),
          createSnapshot: async () => recoverySnapshot(),
          verifyLedgerContract: async () => {
            jest.advanceTimersByTime(MAX_ADOPTION_RUN_DURATION_MS + 1);
          },
          verifyGitHub: async () => undefined,
          verifyAdoptionFiles: () => undefined,
          verifyProvider: async () => undefined,
          verifyTargetArtifact: () => targetReconciliationReport(),
          writeSourceEvidence: fakeSourceEvidenceArtifact,
        },
      ),
    ).rejects.toThrow("bounded run window");
    expect(
      queries.some((query) =>
        query.text.startsWith("DELETE FROM drizzle.__drizzle_migrations"),
      ),
    ).toBe(true);
    expect(queries.filter((query) => query.text === "COMMIT")).toHaveLength(1);
    expect(queries.some((query) => query.text === "ROLLBACK")).toBe(true);
  });

  it("fails before database evidence if SCRAM channel binding is unavailable", async () => {
    const environment = runnerEnvironment();
    const { client, queries } = fakeClient({ offerChannelBinding: false });
    await expect(
      runLegacyProductionLedgerAdoption(
        environment,
        () => client as unknown as Client,
        fetch,
        {
          createSnapshot: async () => recoverySnapshot(),
          verifyGitHub: async () => undefined,
          verifyAdoptionFiles: () => undefined,
          verifyProvider: async () => undefined,
          verifyTargetArtifact: () => targetReconciliationReport(),
          writeSourceEvidence: fakeSourceEvidenceArtifact,
        },
      ),
    ).rejects.toThrow("SCRAM-SHA-256-PLUS");
    expect(queries).toHaveLength(0);
  });

  it("reports a committed adoption separately when explicit unlock confirmation fails", async () => {
    const environment = runnerEnvironment();
    const configuration = resolveAdoptionConfiguration(environment, NOW);
    const { client } = fakeClient({ refuseUnlock: true });
    let evidenceChecks = 0;
    await expect(
      runLegacyProductionLedgerAdoption(
        environment,
        () => client as unknown as Client,
        fetch,
        {
          collectCatalog: async () =>
            approvedSourceEvidence(configuration).audit,
          collectEvidence: async () => {
            evidenceChecks += 1;
            return evidenceChecks === 3
              ? approvedPostAdoptionEvidence(configuration)
              : approvedSourceEvidence(configuration);
          },
          createSnapshot: async () => recoverySnapshot(),
          verifyLedgerContract: async () => undefined,
          verifyGitHub: async () => undefined,
          verifyAdoptionFiles: () => undefined,
          verifyProvider: async () => undefined,
          verifyTargetArtifact: () => targetReconciliationReport(),
          writeSourceEvidence: fakeSourceEvidenceArtifact,
        },
      ),
    ).resolves.toMatchObject({
      advisoryLockCleanup: "released-by-connection-close",
      status: "adopted-with-lock-cleanup-warning",
    });
  });

  it("reports a lost mutation COMMIT acknowledgement as unknown and never retries", async () => {
    const environment = runnerEnvironment();
    const configuration = resolveAdoptionConfiguration(environment, NOW);
    const { client, queries } = fakeClient({ failMutationCommit: true });
    await expect(
      runLegacyProductionLedgerAdoption(
        environment,
        () => client as unknown as Client,
        fetch,
        {
          collectCatalog: async () =>
            approvedSourceEvidence(configuration).audit,
          collectEvidence: async () => approvedSourceEvidence(configuration),
          createSnapshot: async () => recoverySnapshot(),
          verifyLedgerContract: async () => undefined,
          verifyGitHub: async () => undefined,
          verifyAdoptionFiles: () => undefined,
          verifyProvider: async () => undefined,
          verifyTargetArtifact: () => targetReconciliationReport(),
          writeSourceEvidence: fakeSourceEvidenceArtifact,
        },
      ),
    ).rejects.toBeInstanceOf(AdoptionCommitOutcomeUnknownError);
    expect(queries.filter((query) => query.text === "COMMIT")).toHaveLength(2);
    expect(queries.some((query) => query.text === "ROLLBACK")).toBe(false);
  });

  it("halts with a committed-state error if the fresh post-commit audit fails", async () => {
    const environment = runnerEnvironment();
    const configuration = resolveAdoptionConfiguration(environment, NOW);
    const { client, queries } = fakeClient();
    await expect(
      runLegacyProductionLedgerAdoption(
        environment,
        () => client as unknown as Client,
        fetch,
        {
          collectCatalog: async () =>
            approvedSourceEvidence(configuration).audit,
          collectEvidence: async () => approvedSourceEvidence(configuration),
          createSnapshot: async () => recoverySnapshot(),
          verifyLedgerContract: async () => undefined,
          verifyGitHub: async () => undefined,
          verifyAdoptionFiles: () => undefined,
          verifyProvider: async () => undefined,
          verifyTargetArtifact: () => targetReconciliationReport(),
          writeSourceEvidence: fakeSourceEvidenceArtifact,
        },
      ),
    ).rejects.toBeInstanceOf(AdoptionPostCommitVerificationError);
    expect(queries.filter((query) => query.text === "COMMIT")).toHaveLength(2);
    expect(queries.filter((query) => query.text === "ROLLBACK")).toHaveLength(
      1,
    );
  });
});

describe("catalog and data fail-closed gates", () => {
  it("rejects a migration owner that cannot drain signed-context application backends", () => {
    const configuration = resolveAdoptionConfiguration(
      adoptionEnvironment(),
      NOW,
    );
    const evidence = approvedSourceEvidence(configuration);
    evidence.identity.migrationOwnerCanSignalBackends = false;
    expect(() => assertAdoptionEvidence(evidence, configuration)).toThrow(
      "identity",
    );
  });

  it("rechecks effective backend-signal capability at the mutation boundary", async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [{ migration_owner_can_signal_backends: true }],
      })
      .mockResolvedValueOnce({
        rows: [{ migration_owner_can_signal_backends: false }],
      });
    await expect(
      assertMigrationOwnerCanSignalBackends({ query }),
    ).resolves.toBeUndefined();
    await expect(
      assertMigrationOwnerCanSignalBackends({ query }),
    ).rejects.toThrow("cannot signal application backends");
  });

  it("requires an exact inert Drizzle ledger table contract", () => {
    const exact = {
      columnContract: [
        "1:id:integer:true:false:false:nextval('drizzle.__drizzle_migrations_id_seq'::regclass)",
        "2:hash:text:true:false:false:<none>",
        "3:created_at:bigint:false:false:false:<none>",
      ],
      constraintCount: 1,
      forceRls: false,
      indexCount: 1,
      incomingForeignKeyCount: 0,
      inheritanceCount: 0,
      nonInternalTriggerCount: 0,
      persistence: "p",
      policyCount: 0,
      publicationCount: 0,
      primaryConstraintDefinition: "PRIMARY KEY (id)",
      primaryConstraintCount: 1,
      primaryIndexDefinition:
        "CREATE UNIQUE INDEX __drizzle_migrations_pkey ON drizzle.__drizzle_migrations USING btree (id)",
      primaryIndexCount: 1,
      relationKind: "r",
      rls: false,
      ruleCount: 0,
      runtimeBypassesRls: false,
      runtimeCanCreateCurrentDatabase: false,
      runtimeCanCreateDatabase: false,
      runtimeCanCreateRole: false,
      runtimeCanLogin: true,
      runtimeDrizzleSchemaPrivileges: ["USAGE"],
      runtimeLedgerPrivileges: ["SELECT"],
      runtimeRoleMemberships: [],
      runtimeOwnedObjectCount: 0,
      runtimeOwnsDatabase: false,
      runtimeReplication: false,
      runtimeRoleConfig: [],
      runtimeRoleDatabaseSettingCount: 0,
      runtimeRoleName: "school_sis_runtime",
      runtimeSequencePrivileges: [],
      runtimeSuperuser: false,
      platformBypassesRls: false,
      platformCanCreateCurrentDatabase: false,
      platformCanCreateDatabase: false,
      platformCanCreateRole: false,
      platformCanLogin: true,
      platformDrizzleSchemaPrivileges: ["USAGE"],
      platformLedgerPrivileges: ["SELECT"],
      platformRoleMemberships: [],
      platformOwnedObjectCount: 0,
      platformOwnsDatabase: false,
      platformReplication: false,
      platformRoleConfig: [],
      platformRoleDatabaseSettingCount: 0,
      platformRoleName: "school_sis_platform",
      platformSequencePrivileges: [],
      platformSuperuser: false,
      schemaAcl: [
        "neondb_owner:neondb_owner:CREATE:false",
        "neondb_owner:neondb_owner:USAGE:false",
        "school_sis_platform:neondb_owner:USAGE:false",
        "school_sis_runtime:neondb_owner:USAGE:false",
      ],
      schemaOwner: "neondb_owner",
      serverVersionNumber: 180_000,
      sequenceAcl: [
        "neondb_owner:neondb_owner:SELECT:false",
        "neondb_owner:neondb_owner:UPDATE:false",
        "neondb_owner:neondb_owner:USAGE:false",
      ],
      sequenceCacheSize: "1",
      sequenceCycle: false,
      sequenceDataType: "integer",
      sequenceIncrement: "1",
      sequenceIsCalled: true,
      sequenceLastValue: "16",
      sequenceMaxValue: "2147483647",
      sequenceMinValue: "1",
      sequenceOwner: "neondb_owner",
      sequenceOwnerMatchesLedger: true,
      sequencePersistence: "p",
      sequenceStartValue: "1",
      serialSequence: "drizzle.__drizzle_migrations_id_seq",
      tableAcl: [
        "neondb_owner:neondb_owner:DELETE:false",
        "neondb_owner:neondb_owner:INSERT:false",
        "neondb_owner:neondb_owner:MAINTAIN:false",
        "neondb_owner:neondb_owner:REFERENCES:false",
        "neondb_owner:neondb_owner:SELECT:false",
        "neondb_owner:neondb_owner:TRIGGER:false",
        "neondb_owner:neondb_owner:TRUNCATE:false",
        "neondb_owner:neondb_owner:UPDATE:false",
        "school_sis_platform:neondb_owner:SELECT:false",
        "school_sis_runtime:neondb_owner:SELECT:false",
      ],
      tableColumnAclCount: 0,
      tableOwner: "neondb_owner",
      totalTriggerCount: 0,
      maximumLedgerId: 16,
    };
    expect(() =>
      assertLedgerTableContract(
        exact,
        "neondb_owner",
        "school_sis_runtime",
        "school_sis_platform",
      ),
    ).not.toThrow();
    expect(() =>
      assertLedgerTableContract(
        { ...exact, nonInternalTriggerCount: 1 },
        "neondb_owner",
        "school_sis_runtime",
        "school_sis_platform",
      ),
    ).toThrow("exact and inert");
    expect(() =>
      assertLedgerTableContract(
        { ...exact, sequenceLastValue: "15" },
        "neondb_owner",
        "school_sis_runtime",
        "school_sis_platform",
      ),
    ).toThrow("exact and inert");
    expect(() =>
      assertLedgerTableContract(
        { ...exact, sequenceLastValue: "2147483647" },
        "neondb_owner",
        "school_sis_runtime",
        "school_sis_platform",
      ),
    ).toThrow("exact and inert");
    expect(() =>
      assertLedgerTableContract(
        { ...exact, sequenceMaxValue: "1040" },
        "neondb_owner",
        "school_sis_runtime",
        "school_sis_platform",
      ),
    ).toThrow("exact and inert");
    expect(() =>
      assertLedgerTableContract(
        {
          ...exact,
          columnContract: [
            "1:id:integer:true:false:false:42",
            ...exact.columnContract.slice(1),
          ],
        },
        "neondb_owner",
        "school_sis_runtime",
        "school_sis_platform",
      ),
    ).toThrow("exact and inert");
    expect(() =>
      assertLedgerTableContract(
        {
          ...exact,
          schemaAcl: exact.schemaAcl.map((entry) =>
            entry === "school_sis_runtime:neondb_owner:USAGE:false"
              ? "school_sis_runtime:unexpected_grantor:USAGE:false"
              : entry,
          ),
        },
        "neondb_owner",
        "school_sis_runtime",
        "school_sis_platform",
      ),
    ).toThrow("exact and inert");
    expect(() =>
      assertLedgerTableContract(
        { ...exact, platformSuperuser: true },
        "neondb_owner",
        "school_sis_runtime",
        "school_sis_platform",
      ),
    ).toThrow("exact and inert");
    expect(() =>
      assertLedgerTableContract(
        { ...exact, runtimeCanCreateCurrentDatabase: true },
        "neondb_owner",
        "school_sis_runtime",
        "school_sis_platform",
      ),
    ).toThrow("exact and inert");
    expect(() =>
      assertLedgerTableContract(
        { ...exact, platformRoleConfig: ["statement_timeout=0"] },
        "neondb_owner",
        "school_sis_runtime",
        "school_sis_platform",
      ),
    ).toThrow("exact and inert");
    expect(() =>
      assertLedgerTableContract(
        { ...exact, platformOwnedObjectCount: 1 },
        "neondb_owner",
        "school_sis_runtime",
        "school_sis_platform",
      ),
    ).toThrow("exact and inert");
    expect(() =>
      assertLedgerTableContract(
        { ...exact, incomingForeignKeyCount: 1, totalTriggerCount: 2 },
        "neondb_owner",
        "school_sis_runtime",
        "school_sis_platform",
      ),
    ).toThrow("exact and inert");
    expect(() =>
      assertLedgerTableContract(
        {
          ...exact,
          tableAcl: [...exact.tableAcl, "PUBLIC:neondb_owner:INSERT:false"],
        },
        "neondb_owner",
        "school_sis_runtime",
        "school_sis_platform",
      ),
    ).toThrow("exact and inert");
  });

  it("accepts the exact historical or forward-safe material state", () => {
    expect(EXPECTED_CHECK_CONSTRAINTS).toHaveLength(61);
    expect(EXPECTED_RECONCILIATION_INDEXES).toHaveLength(4);
    expect(EXPECTED_TRIGGERS).toHaveLength(2);
    expect(() =>
      assertCatalogInvariants(completeCatalogInvariants()),
    ).not.toThrow();
    expect(() =>
      assertCatalogInvariants({
        ...completeCatalogInvariants(),
        integrationModeDefault: "LIVE",
      }),
    ).not.toThrow();
  });

  it("permits only the provider's exact non-assumable management edge for each service role", () => {
    const managementEdge: AdoptionRoleMembershipEdge = {
      member_role: "neondb_owner",
      granted_role: "school_sis_runtime",
      grantor_role: "cloud_admin",
      admin_option: true,
      inherit_option: false,
      set_option: false,
    };
    expect(() =>
      assertAdoptionRoleMembershipsAreSafe(
        [],
        "neondb_owner",
        "school_sis_runtime",
        "runtime",
      ),
    ).not.toThrow();
    expect(() =>
      assertAdoptionRoleMembershipsAreSafe(
        [managementEdge],
        "neondb_owner",
        "school_sis_runtime",
        "runtime",
      ),
    ).not.toThrow();
  });

  it.each([
    [
      "outgoing membership",
      {
        member_role: "school_sis_runtime",
        granted_role: "neon_superuser",
        grantor_role: "cloud_admin",
        admin_option: false,
        inherit_option: false,
        set_option: false,
      },
    ],
    [
      "incoming membership from another role",
      {
        member_role: "other_owner",
        granted_role: "school_sis_runtime",
        grantor_role: "cloud_admin",
        admin_option: true,
        inherit_option: false,
        set_option: false,
      },
    ],
    [
      "inheritable incoming membership",
      {
        member_role: "neondb_owner",
        granted_role: "school_sis_runtime",
        grantor_role: "cloud_admin",
        admin_option: true,
        inherit_option: true,
        set_option: false,
      },
    ],
    [
      "settable incoming membership",
      {
        member_role: "neondb_owner",
        granted_role: "school_sis_runtime",
        grantor_role: "cloud_admin",
        admin_option: true,
        inherit_option: false,
        set_option: true,
      },
    ],
    [
      "non-admin incoming membership",
      {
        member_role: "neondb_owner",
        granted_role: "school_sis_runtime",
        grantor_role: "cloud_admin",
        admin_option: false,
        inherit_option: false,
        set_option: false,
      },
    ],
    [
      "blank grantor",
      {
        member_role: "neondb_owner",
        granted_role: "school_sis_runtime",
        grantor_role: " ",
        admin_option: true,
        inherit_option: false,
        set_option: false,
      },
    ],
  ] as const)("rejects an unsafe %s edge", (_label, membership) => {
    expect(() =>
      assertAdoptionRoleMembershipsAreSafe(
        [membership],
        "neondb_owner",
        "school_sis_runtime",
        "runtime",
      ),
    ).toThrow("membership contract is unsafe");
  });

  it("rejects multiple otherwise-permitted provider management edges", () => {
    const managementEdge: AdoptionRoleMembershipEdge = {
      member_role: "neondb_owner",
      granted_role: "school_sis_runtime",
      grantor_role: "cloud_admin",
      admin_option: true,
      inherit_option: false,
      set_option: false,
    };
    expect(() =>
      assertAdoptionRoleMembershipsAreSafe(
        [managementEdge, managementEdge],
        "neondb_owner",
        "school_sis_runtime",
        "runtime",
      ),
    ).toThrow("membership contract is unsafe");
  });

  it.each([
    ["table count", { publicTableCount: 143 }],
    ["RLS", { rlsTableCount: 143 }],
    ["FORCE RLS", { forcedRlsTableCount: 143 }],
    ["policy", { policyCoveredTableCount: 143 }],
    ["RLS bypass", { rlsBypassedTableCount: 143 }],
    ["column ACL", { publicColumnAclCount: 1 }],
    ["invalid index", { invalidIndexCount: 1 }],
    ["unvalidated constraint", { unvalidatedConstraintCount: 1 }],
    ["data violation", { dataViolationCount: 1 }],
  ])("rejects a %s failure", (_label, override) => {
    expect(() =>
      assertCatalogInvariants({ ...completeCatalogInvariants(), ...override }),
    ).toThrow();
  });

  it.each([
    "invalid_metadata_record_object_scope",
    "invalid_metadata_value_chain",
    "null_bi_dashboards_tenant",
    "null_bi_datasets_tenant",
    "null_operator_console_runbooks_tenant",
  ] as const)("rejects nonzero %s evidence", (key) => {
    const invariants = completeCatalogInvariants();
    invariants.dataViolationCounts[key] = 1;
    invariants.dataViolationCount = 1;
    expect(() => assertCatalogInvariants(invariants)).toThrow(
      "data violates reconciliation invariants",
    );
  });

  it("rejects any missing material integrity object", () => {
    const missingCheck = completeCatalogInvariants();
    missingCheck.checkConstraintKeys.pop();
    expect(() => assertCatalogInvariants(missingCheck)).toThrow(
      "61 legacy CHECK",
    );

    const badIndex = completeCatalogInvariants();
    badIndex.indexes[0].valid = false;
    expect(() => assertCatalogInvariants(badIndex)).toThrow(
      "Reconciliation index",
    );

    const badTrigger = completeCatalogInvariants();
    badTrigger.triggers[0].functionName = "unexpected_function";
    expect(() => assertCatalogInvariants(badTrigger)).toThrow(
      "notification triggers",
    );
  });
});

const localTestUrl = process.env.LEGACY_LEDGER_ADOPTION_LOCAL_TEST_URL;
const localIt = localTestUrl ? it : it.skip;

function requireDisposableLocalTestUrl(): string {
  if (!localTestUrl)
    throw new Error("The disposable local URL is unavailable.");
  const parsed = new URL(localTestUrl);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  const queryKeys = [...parsed.searchParams.keys()].map((key) =>
    key.toLowerCase(),
  );
  if (
    !["localhost", "127.0.0.1", "::1", "[::1]"].includes(
      parsed.hostname.toLowerCase(),
    ) ||
    !database.startsWith("school_sis_legacy_adoption_test_") ||
    queryKeys.some((key) => key !== "sslmode") ||
    parsed.searchParams.getAll("sslmode").length !== 1 ||
    parsed.searchParams.get("sslmode") !== "disable"
  ) {
    throw new Error(
      "LEGACY_LEDGER_ADOPTION_LOCAL_TEST_URL must identify a disposable local test database.",
    );
  }
  return localTestUrl;
}

describe("disposable-local atomic ledger replacement", () => {
  localIt(
    "replaces only the exact legacy rows and leaves 0001 pending",
    async () => {
      const client = new Client({
        connectionString: requireDisposableLocalTestUrl(),
      });
      const runtimeRole = `school_sis_ledger_runtime_${process.pid}_${Date.now()}`;
      const platformRole = `school_sis_ledger_platform_${process.pid}_${Date.now()}`;
      const memberRole = `school_sis_ledger_member_${process.pid}_${Date.now()}`;
      const databaseName = decodeURIComponent(
        new URL(requireDisposableLocalTestUrl()).pathname.replace(/^\//, ""),
      );
      const quotedDatabaseName = `"${databaseName.replaceAll('"', '""')}"`;
      await client.connect();
      try {
        await client.query(`CREATE ROLE ${runtimeRole} LOGIN`);
        await client.query(`CREATE ROLE ${platformRole} LOGIN`);
        await client.query(`CREATE ROLE ${memberRole} NOLOGIN`);
        await client.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
        await client.query("CREATE SCHEMA drizzle");
        await client.query(`
          CREATE TABLE drizzle.__drizzle_migrations (
            id serial PRIMARY KEY,
            hash text NOT NULL,
            created_at bigint
          )
        `);
        await client.query(
          `GRANT USAGE ON SCHEMA drizzle TO ${runtimeRole}, ${platformRole}`,
        );
        await client.query(
          `GRANT SELECT ON TABLE drizzle.__drizzle_migrations TO ${runtimeRole}, ${platformRole}`,
        );
        for (const entry of EXACT_LEGACY_LEDGER) {
          await client.query(
            `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`,
            [entry.hash, entry.createdAt],
          );
        }
        await assertLiveLedgerTableContract(
          client,
          "postgres",
          runtimeRole,
          platformRole,
        );
        await client.query(
          `ALTER DATABASE ${quotedDatabaseName} SET statement_timeout = '5s'`,
        );
        await expect(
          assertLiveLedgerTableContract(
            client,
            "postgres",
            runtimeRole,
            platformRole,
          ),
        ).rejects.toThrow("exact and inert");
        await client.query(
          `ALTER DATABASE ${quotedDatabaseName} RESET statement_timeout`,
        );
        await client.query(`GRANT ${runtimeRole} TO ${memberRole}`);
        await expect(
          assertLiveLedgerTableContract(
            client,
            "postgres",
            runtimeRole,
            platformRole,
          ),
        ).rejects.toThrow("membership contract is unsafe");
        await client.query(`REVOKE ${runtimeRole} FROM ${memberRole}`);
        await client.query(`GRANT ${platformRole} TO ${memberRole}`);
        await expect(
          assertLiveLedgerTableContract(
            client,
            "postgres",
            runtimeRole,
            platformRole,
          ),
        ).rejects.toThrow("membership contract is unsafe");
        await client.query(`REVOKE ${platformRole} FROM ${memberRole}`);
        await client.query(
          `GRANT ${runtimeRole} TO postgres WITH ADMIN TRUE, INHERIT FALSE, SET FALSE`,
        );
        await assertLiveLedgerTableContract(
          client,
          "postgres",
          runtimeRole,
          platformRole,
        );
        await client.query(`REVOKE ${runtimeRole} FROM postgres`);
        await assertLiveLedgerTableContract(
          client,
          "postgres",
          runtimeRole,
          platformRole,
        );
        await client.query(`
          CREATE TABLE drizzle.shadow_ledger_reference (
            migration_id integer REFERENCES drizzle.__drizzle_migrations(id)
              ON DELETE CASCADE
          )
        `);
        await expect(
          assertLiveLedgerTableContract(
            client,
            "postgres",
            runtimeRole,
            platformRole,
          ),
        ).rejects.toThrow("exact and inert");
        await client.query("DROP TABLE drizzle.shadow_ledger_reference");
        await assertLiveLedgerTableContract(
          client,
          "postgres",
          runtimeRole,
          platformRole,
        );
        await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE");
        await client.query(`
          UPDATE drizzle.__drizzle_migrations
          SET hash = repeat('f', 64)
          WHERE created_at = ${EXACT_LEGACY_LEDGER[8].createdAt}
        `);
        await expect(
          replaceExactLegacyLedgerWithinTransaction(client),
        ).rejects.toThrow("immutable entry 8");
        await client.query("ROLLBACK");
        const unchanged = await client.query(
          "SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at, hash",
        );
        expect(() => assertExactLegacyLedger(unchanged.rows)).not.toThrow();

        await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE");
        const { baseline, pending } =
          await replaceExactLegacyLedgerWithinTransaction(client);
        await client.query("COMMIT");
        const rows = await client.query(
          "SELECT hash, created_at FROM drizzle.__drizzle_migrations",
        );
        expect(rows.rows).toEqual([
          { hash: baseline.hash, created_at: baseline.createdAt },
        ]);
        expect(pending.tag).toBe("0001_reconcile_production_integrity");
        await assertLiveLedgerTableContract(
          client,
          "postgres",
          runtimeRole,
          platformRole,
        );
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        await client
          .query(`ALTER DATABASE ${quotedDatabaseName} RESET statement_timeout`)
          .catch(() => undefined);
        await client.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
        await client
          .query(`REVOKE ${runtimeRole} FROM postgres`)
          .catch(() => undefined);
        await client
          .query(`REVOKE ${platformRole} FROM postgres`)
          .catch(() => undefined);
        await client
          .query(`DROP ROLE IF EXISTS ${memberRole}`)
          .catch(() => undefined);
        await client
          .query(`DROP ROLE IF EXISTS ${platformRole}`)
          .catch(() => undefined);
        await client
          .query(`DROP ROLE IF EXISTS ${runtimeRole}`)
          .catch(() => undefined);
        await client.end();
      }
    },
    30_000,
  );

  localIt(
    "waits for a writer before taking the mutation snapshot and freezes all approved tables",
    async () => {
      const connectionString = requireDisposableLocalTestUrl();
      const adopter = new Client({ connectionString });
      const writer = new Client({ connectionString });
      const tableNames = [
        "integration_connections",
        ...Array.from(
          { length: 143 },
          (_, index) => `table_${String(index).padStart(3, "0")}`,
        ),
      ];
      await adopter.connect();
      await writer.connect();
      try {
        for (const name of tableNames) {
          await adopter.query(`CREATE TABLE public.${name} (id integer)`);
        }
        const lockStatement = buildPublicTableWriteFreezeStatement(
          targetReconciliationReport(),
        );
        expect(lockStatement).toContain("IN SHARE ROW EXCLUSIVE MODE");

        await writer.query("BEGIN");
        await writer.query("INSERT INTO public.table_142 (id) VALUES (1)");
        await adopter.query("BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE");
        await adopter.query("SET LOCAL lock_timeout = '250ms'");
        await expect(adopter.query(lockStatement)).rejects.toMatchObject({
          code: "55P03",
        });
        await adopter.query("ROLLBACK");

        await writer.query("COMMIT");
        await adopter.query("BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE");
        await adopter.query("SET LOCAL lock_timeout = '2s'");
        await expect(adopter.query(lockStatement)).resolves.toBeDefined();
        await adopter.query("SELECT current_setting('transaction_isolation')");
        await adopter.query("COMMIT");
      } finally {
        await writer.query("ROLLBACK").catch(() => undefined);
        await adopter.query("ROLLBACK").catch(() => undefined);
        for (const name of [...tableNames].reverse()) {
          await adopter
            .query(`DROP TABLE IF EXISTS public.${name}`)
            .catch(() => undefined);
        }
        await writer.end();
        await adopter.end();
      }
    },
    30_000,
  );

  localIt(
    "demonstrates that hidden violating rows require the explicit RLS-bypass gate",
    async () => {
      const client = new Client({
        connectionString: requireDisposableLocalTestUrl(),
      });
      const role = `school_sis_rls_hidden_${process.pid}_${Date.now()}`;
      await client.connect();
      try {
        await client.query(`CREATE ROLE ${role} NOLOGIN`);
        await client.query(
          "CREATE TABLE public.legacy_adoption_rls_hidden (id integer)",
        );
        await client.query(
          "INSERT INTO public.legacy_adoption_rls_hidden (id) VALUES (1)",
        );
        await client.query(
          "ALTER TABLE public.legacy_adoption_rls_hidden ENABLE ROW LEVEL SECURITY",
        );
        await client.query(
          "ALTER TABLE public.legacy_adoption_rls_hidden FORCE ROW LEVEL SECURITY",
        );
        await client.query(
          "CREATE POLICY hide_all ON public.legacy_adoption_rls_hidden FOR SELECT USING (false)",
        );
        await client.query(
          `GRANT SELECT ON public.legacy_adoption_rls_hidden TO ${role}`,
        );
        await client.query(`SET ROLE ${role}`);
        const hidden = await client.query<{ count: string }>(
          "SELECT count(*) FROM public.legacy_adoption_rls_hidden",
        );
        const active = await client.query<{ active: boolean }>(
          "SELECT pg_catalog.row_security_active('public.legacy_adoption_rls_hidden'::regclass) AS active",
        );
        expect(hidden.rows[0]?.count).toBe("0");
        expect(active.rows[0]?.active).toBe(true);
        await client.query("RESET ROLE");

        const configuration = resolveAdoptionConfiguration(
          adoptionEnvironment(),
          NOW,
        );
        const evidence = approvedSourceEvidence(configuration);
        evidence.identity.roleBypassesRls = false;
        expect(() => assertAdoptionEvidence(evidence, configuration)).toThrow(
          "identity",
        );
      } finally {
        await client.query("RESET ROLE").catch(() => undefined);
        await client
          .query("DROP TABLE IF EXISTS public.legacy_adoption_rls_hidden")
          .catch(() => undefined);
        await client
          .query(`DROP ROLE IF EXISTS ${role}`)
          .catch(() => undefined);
        await client.end();
      }
    },
    30_000,
  );
});
