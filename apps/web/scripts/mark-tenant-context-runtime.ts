import { Client } from "pg";
import { resolveDatabaseConnectionOptions } from "../../../packages/api/src/db/ssl";
import {
  assertTenantContextPreProvisionContract,
  DEPLOYMENT_MIGRATION_LOCK_NAME,
  resolveDeploymentConnection,
} from "./deployment-migrations";

interface PromotionEvidence {
  audience: string;
  deploymentId: string;
  keyId: string;
  sha: string;
}

function promotionEvidence(arguments_: readonly string[]): PromotionEvidence {
  if (
    arguments_.length !== 8 ||
    arguments_[0] !== "--sha" ||
    arguments_[2] !== "--deployment-id" ||
    arguments_[4] !== "--attested-key-id" ||
    arguments_[6] !== "--attested-audience"
  ) {
    throw new Error(
      "Exactly --sha SHA --deployment-id ID --attested-key-id KEY --attested-audience AUDIENCE is required.",
    );
  }
  const sha = arguments_[1] || "";
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error("--sha must be a full lowercase Git commit SHA.");
  }
  const deploymentId = arguments_[3] || "";
  const keyId = arguments_[5] || "";
  const audience = arguments_[7] || "";
  if (!/^dpl_[A-Za-z0-9]+$/.test(deploymentId)) {
    throw new Error("--deployment-id must be an exact Vercel deployment ID.");
  }
  if (!/^[a-z0-9][a-z0-9._-]{0,31}$/.test(keyId)) {
    throw new Error("--attested-key-id is invalid.");
  }
  if (!/^[a-z0-9][a-z0-9:._-]{2,191}$/.test(audience)) {
    throw new Error("--attested-audience is invalid.");
  }
  return { audience, deploymentId, keyId, sha };
}

function signingConfiguration(): { audience: string; keyId: string } {
  const keyId = process.env.TENANT_CONTEXT_SIGNING_KEY_ID || "";
  if (!/^[a-z0-9][a-z0-9._-]{0,31}$/.test(keyId)) {
    throw new Error(
      "TENANT_CONTEXT_SIGNING_KEY_ID must identify the promoted signing key.",
    );
  }
  const audience = process.env.TENANT_CONTEXT_AUDIENCE || "";
  if (!/^[a-z0-9][a-z0-9:._-]{2,191}$/.test(audience)) {
    throw new Error(
      "TENANT_CONTEXT_AUDIENCE must identify the promoted database audience.",
    );
  }
  return { audience, keyId };
}

async function main(): Promise<void> {
  const evidence = promotionEvidence(process.argv.slice(2));
  const configured = signingConfiguration();
  if (
    evidence.keyId !== configured.keyId ||
    evidence.audience !== configured.audience
  ) {
    throw new Error(
      "Authenticated runtime attestation does not match the protected signing configuration.",
    );
  }
  const connection = resolveDeploymentConnection("production", process.env);
  const client = new Client({
    ...resolveDatabaseConnectionOptions(
      connection.connectionString,
      connection.sslMode,
    ),
    application_name: "school-sis-tenant-context-runtime-marker",
  });

  try {
    await client.connect();
    await client.query("BEGIN");
    // hashtextextended, matching runDeploymentMigrations, NOT hashtext.
    //
    // The two call sites share DEPLOYMENT_MIGRATION_LOCK_NAME precisely so they
    // exclude each other, but hashed the name differently: hashtext('...') is
    // 26945508 while hashtextextended('...', 0) is 7973690206200735716. Those
    // are different advisory keys, so neither lock ever saw the other and a
    // hand-run `pnpm db:migrate:deploy` could interleave with this marker.
    // The low 32 bits collide, which is why `pg_locks` made them look alike.
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [DEPLOYMENT_MIGRATION_LOCK_NAME],
    );
    await client.query(
      `LOCK TABLE
         app_private.tenant_context_signing_keys,
         app_private.tenant_context_rollout_state
       IN ACCESS EXCLUSIVE MODE`,
    );
    await assertTenantContextPreProvisionContract(client);
    const state = await client.query<{
      current_key_present: boolean;
      enforcement_phase: number;
      key_count: number;
    }>(
      `
        SELECT
            state.enforcement_phase,
            (
                SELECT count(*)::integer
                FROM app_private.tenant_context_signing_keys keys
            ) AS key_count,
            EXISTS (
                SELECT 1
                FROM app_private.tenant_context_signing_keys keys
                WHERE keys.key_id = $1
                  AND keys.audience = $2
            ) AS current_key_present
        FROM app_private.tenant_context_rollout_state state
        WHERE state.singleton = true
        FOR UPDATE
    `,
      [evidence.keyId, evidence.audience],
    );
    if (
      state.rows.length !== 1 ||
      !state.rows[0] ||
      ![1, 2].includes(state.rows[0].enforcement_phase) ||
      state.rows[0].current_key_present !== true ||
      state.rows[0].key_count < 1 ||
      state.rows[0].key_count > 2
    ) {
      throw new Error(
        "Tenant-context signing keys or rollout state are not ready for promotion evidence.",
      );
    }
    await client.query(
      `UPDATE app_private.tenant_context_rollout_state
       SET signed_runtime_sha = $1,
           promoted_key_id = $2,
           promoted_audience = $3,
           promoted_deployment_id = $4,
           promoted_at = clock_timestamp()
       WHERE singleton = true`,
      [evidence.sha, evidence.keyId, evidence.audience, evidence.deploymentId],
    );
    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original error.
    }
    throw error;
  } finally {
    await client.end();
  }
  console.info("Recorded the verified signing-runtime promotion.");
}

main().catch((error) => {
  console.error(
    "Could not record signing-runtime promotion:",
    error instanceof Error ? error.message : "unknown error",
  );
  process.exitCode = 1;
});
