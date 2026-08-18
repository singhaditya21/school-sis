import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const workflow = readFileSync(
  resolve(process.cwd(), "../..", ".github/workflows/preview.yml"),
  "utf8",
);
const productionWorkflow = readFileSync(
  resolve(process.cwd(), "../..", ".github/workflows/deploy-production.yml"),
  "utf8",
);
const cleanupWorkflow = readFileSync(
  resolve(process.cwd(), "../..", ".github/workflows/preview-cleanup.yml"),
  "utf8",
);
const productionProvenanceGate = readFileSync(
  resolve(
    process.cwd(),
    "../..",
    "scripts/verify-production-release-provenance.mjs",
  ),
  "utf8",
);
const tenantContextKeyContract = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "../..", ".github/tenant-context-key-contract.json"),
    "utf8",
  ),
) as Record<string, unknown>;
const rootPackage = JSON.parse(
  readFileSync(resolve(process.cwd(), "../..", "package.json"), "utf8"),
) as {
  pnpm?: { patchedDependencies?: Record<string, string> };
};
const rootLockfile = readFileSync(
  resolve(process.cwd(), "../..", "pnpm-lock.yaml"),
  "utf8",
);
const vercelPatch = readFileSync(
  resolve(process.cwd(), "../..", "patches/vercel@59.0.0.patch"),
  "utf8",
);

describe("preview Vercel project isolation workflow", () => {
  it("can publish the verified preview on the pull request", () => {
    expect(workflow).toMatch(
      /permissions:\n  contents: read\n  issues: write\n  pull-requests: write/,
    );
    expect(workflow).toContain("Create or update pull-request preview comment");
  });

  it("allows a shared team only when the preview project differs", () => {
    expect(workflow).toContain(
      'if [ "$VERCEL_PROJECT_ID" = "$PRODUCTION_VERCEL_PROJECT_ID" ]; then',
    );
    expect(workflow).not.toContain(
      '[ "$VERCEL_ORG_ID" = "$PRODUCTION_VERCEL_ORG_ID" ] ||',
    );
  });

  it("proves the token resolves the exact configured preview target", () => {
    expect(workflow).toContain(
      "'PRODUCTION_VERCEL_ORG_ID', 'PRODUCTION_VERCEL_PROJECT_ID'",
    );
    expect(workflow).toContain(
      "https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}?teamId=${VERCEL_ORG_ID}",
    );
    expect(workflow).toContain(".id == $project and .accountId == $team");
    expect(workflow).toContain('if [ "$preview_http" != "200" ]; then');
  });

  it("fails unless production access is denied or hidden", () => {
    expect(workflow).toContain(
      "https://api.vercel.com/v9/projects/${PRODUCTION_VERCEL_PROJECT_ID}?teamId=${PRODUCTION_VERCEL_ORG_ID}",
    );
    expect(workflow).toContain('case "$production_http" in');
    expect(workflow).toContain("403|404)");
    expect(workflow).toContain("200)");
    expect(workflow).toContain(
      "The preview token can access the configured production Vercel project.",
    );
    expect(workflow).toContain(
      "Could not prove that the preview token is isolated from production",
    );
  });

  it("keeps Vercel pull on the project-scoped owner-lookup fallback", () => {
    expect(rootPackage.pnpm?.patchedDependencies?.["vercel@59.0.0"]).toBe(
      "patches/vercel@59.0.0.patch",
    );
    expect(rootLockfile).toContain("vercel@59.0.0:");
    expect(rootLockfile).toContain("path: patches/vercel@59.0.0.patch");
    expect(vercelPatch).toContain("chunk-L6NIIAB7.js");
    expect(vercelPatch).toContain("pullCommandLogic");
    expect(vercelPatch).toContain("allowOwnerLookupFallback: true");
    expect(workflow).toContain('VERCEL_CLI_USE_NATIVE_BINARY: "0"');
    expect(workflow).toContain("chunk-L6NIIAB7.js");
    expect(workflow).toContain(
      "The pinned Vercel project-scoped pull patch is not installed.",
    );
  });

  it("assigns the preview alias without an account-level CLI lookup", () => {
    expect(workflow).toContain("node scripts/assign-vercel-preview-alias.mjs");
    expect(workflow).toContain('--deployment-id "$deployment_id"');
    expect(workflow).toContain('--deployment-url "$deployment_url"');
    expect(workflow).toContain('--project-id "$VERCEL_PROJECT_ID"');
    expect(workflow).toContain('--team-id "$VERCEL_ORG_ID"');
    expect(workflow).not.toContain("pnpm exec vercel alias set");
  });

  it("accepts only exact present Vercel build controls and discards them before build", () => {
    const buildControlMap = workflow.slice(
      workflow.indexOf("const expectedVercelBuildControls = new Map(["),
      workflow.indexOf("const allowedPulledNames = new Set(["),
    );
    expect(buildControlMap.match(/\['[A-Z_]+', '[^']+'\]/g)).toHaveLength(5);
    for (const [name, value] of [
      ["NX_DAEMON", "false"],
      ["TURBO_CACHE", "remote:rw"],
      ["TURBO_DOWNLOAD_LOCAL_ENABLED", "true"],
      ["TURBO_REMOTE_ONLY", "true"],
      ["TURBO_RUN_SUMMARY", "true"],
    ]) {
      expect(workflow).toContain(`['${name}', '${value}']`);
    }
    expect(workflow).toContain(
      "pulled[name] === undefined || pulled[name] === expected ? [] : [name]",
    );
    expect(workflow).toContain(
      "Preview Vercel build controls have unexpected values",
    );

    const validation = workflow.indexOf(
      "const invalidBuildControls = [...expectedVercelBuildControls]",
    );
    const environmentRemoval = workflow.indexOf(
      "for (const directory of ['.vercel', 'apps/web/.vercel'])",
    );
    const isolatedRewrite = workflow.indexOf("writeFileSync(environmentPath");
    const applicationBuild = workflow.indexOf(
      "- name: Build, then migrate the isolated preview database",
    );
    expect(validation).toBeGreaterThan(0);
    expect(environmentRemoval).toBeGreaterThan(validation);
    expect(isolatedRewrite).toBeGreaterThan(environmentRemoval);
    expect(applicationBuild).toBeGreaterThan(isolatedRewrite);

    const isolatedEnvironment = workflow.slice(
      workflow.indexOf("const environmentNames = ["),
      workflow.indexOf("writeFileSync(environmentPath"),
    );
    for (const name of [
      "NX_DAEMON",
      "TURBO_CACHE",
      "TURBO_DOWNLOAD_LOCAL_ENABLED",
      "TURBO_REMOTE_ONLY",
      "TURBO_RUN_SUMMARY",
    ]) {
      expect(isolatedEnvironment).not.toContain(`'${name}'`);
    }
  });

  it("proves the preview Neon token cannot access the production project", () => {
    expect(workflow).toContain("Prove Neon preview token project isolation");
    expect(workflow).toContain(
      "https://console.neon.tech/api/v2/projects/${NEON_PREVIEW_PROJECT_ID}",
    );
    expect(workflow).toContain(
      "https://console.neon.tech/api/v2/projects/${PRODUCTION_NEON_PROJECT_ID}",
    );
    expect(workflow).toContain(
      "The preview Neon token can access the production Neon project.",
    );
  });

  it("requires nonempty pairwise-distinct database passwords in both environments", () => {
    for (const source of [workflow, productionWorkflow]) {
      expect(source).toContain(
        "passwords.some((password) => password.length === 0)",
      );
      expect(source).toContain("new Set(passwords).size !== 3");
      expect(source).toContain(
        "passwords must be nonempty and pairwise distinct",
      );
    }
  });

  it("waits for both inherited preview roles before requesting their action URLs", () => {
    const branchCreation = workflow.indexOf(
      "Create or reuse schema-only Neon branch for migrations",
    );
    const readiness = workflow.indexOf(
      "Wait for exact preview roles to become resolvable",
    );
    const runtimeResolution = workflow.indexOf(
      "Resolve pooled Neon URL for the runtime role",
    );
    const platformResolution = workflow.indexOf(
      "Resolve pooled Neon URL for the platform role",
    );
    expect(readiness).toBeGreaterThan(branchCreation);
    expect(runtimeResolution).toBeGreaterThan(readiness);
    expect(platformResolution).toBeGreaterThan(runtimeResolution);

    const readinessScript = workflow.slice(readiness, runtimeResolution);
    expect(readinessScript).toContain("/connection_uri");
    expect(readinessScript).toContain(
      "endpoint.searchParams.set('branch_id', process.env.PREVIEW_BRANCH_ID);",
    );
    expect(readinessScript).toContain(
      "endpoint.searchParams.set('role_name', role);",
    );
    expect(readinessScript).toContain(
      "const readinessDeadline = Date.now() + (5 * 60 * 1_000);",
    );
    expect(readinessScript).toContain("Date.now() >= readinessDeadline");
    expect(readinessScript).toContain(
      "Neon preview roles did not become resolvable",
    );
    expect(readinessScript).not.toContain("CREATE ROLE");
    expect(readinessScript).not.toContain("ALTER ROLE");
  });

  it("uses one PR-scoped branch and refreshes its exact expiry before role resolution", () => {
    const stableName =
      "PREVIEW_BRANCH_NAME: preview/pr-${{ github.event.pull_request.number }}";
    expect(workflow).toContain(stableName);
    expect(cleanupWorkflow).toContain(stableName);
    expect(workflow).not.toContain(
      "PREVIEW_BRANCH_NAME: preview/pr-${{ github.event.pull_request.number }}-${{ github.event.pull_request.head.sha }}",
    );
    expect(cleanupWorkflow).not.toContain(
      "PREVIEW_BRANCH_NAME: preview/pr-${{ github.event.pull_request.number }}-${{ github.event.pull_request.head.sha }}",
    );
    expect(cleanupWorkflow).toContain(
      '.name == $name and .parent_id == null and .init_source == "parent-schema"',
    );
    expect(cleanupWorkflow).not.toContain("--arg parent");

    const branchCreation = workflow.indexOf(
      "Create or reuse schema-only Neon branch for migrations",
    );
    const expiryRefresh = workflow.indexOf(
      "Refresh exact preview branch expiry",
    );
    const roleReadiness = workflow.indexOf(
      "Wait for exact preview roles to become resolvable",
    );
    expect(expiryRefresh).toBeGreaterThan(branchCreation);
    expect(roleReadiness).toBeGreaterThan(expiryRefresh);
    const refreshScript = workflow.slice(expiryRefresh, roleReadiness);
    expect(refreshScript).toContain("method: 'PATCH'");
    expect(refreshScript).toContain(
      "JSON.stringify({ branch: { expires_at: process.env.EXPECTED_EXPIRES_AT } })",
    );
    expect(refreshScript).toContain(
      "!Object.prototype.hasOwnProperty.call(payload?.branch ?? {}, 'parent_id')",
    );
    expect(refreshScript).toContain("payload?.branch?.parent_id === null");
    expect(refreshScript).toContain(
      "payload.branch.init_source === 'parent-schema'",
    );
    expect(refreshScript).toContain(
      "actualExpiresAt.getTime() === expiresAt.getTime()",
    );
    expect(refreshScript).toContain(
      "for (let attempt = 1; attempt <= 20; attempt += 1)",
    );
    expect(refreshScript.match(/method: 'PATCH'/g)).toHaveLength(1);
    expect(refreshScript).toContain(
      "PATCH is not retried after an ambiguous transport result",
    );
    expect(workflow).toContain('sub("\\\\.[0-9]+Z$"; "Z") | fromdateiso8601');
  });

  it("rotates and verifies both isolated preview application credentials", () => {
    const rotation = workflow.indexOf(
      "Rotate and verify isolated preview application credentials",
    );
    const outputValidation = workflow.indexOf("Validate Neon action outputs");
    const migration = workflow.indexOf(
      "pnpm db:migrate:deploy -- --target preview",
    );
    expect(rotation).toBeGreaterThan(
      workflow.indexOf("Resolve pooled Neon URL for the platform role"),
    );
    expect(outputValidation).toBeGreaterThan(rotation);
    expect(migration).toBeGreaterThan(outputValidation);

    expect(workflow).toContain(
      "Preview credential rotation requires one exact Neon branch.",
    );
    expect(workflow).toContain(
      "const runtimePassword = distinctPassword(new Set([migrationPassword]));",
    );
    expect(workflow).toContain("new Set([migrationPassword, runtimePassword])");
    expect(workflow).toContain(
      "EXECUTE format('ALTER ROLE %I PASSWORD %L', runtime_role, runtime_password);",
    );
    expect(workflow).toContain(
      "EXECUTE format('ALTER ROLE %I PASSWORD %L', platform_role, platform_password);",
    );
    expect(workflow).toContain(
      "await verifyRole(rotatedRuntimeUrl, process.env.EXPECTED_RUNTIME_ROLE);",
    );
    expect(workflow).toContain(
      "await verifyRole(rotatedPlatformUrl, process.env.EXPECTED_PLATFORM_ROLE);",
    );
    expect(workflow).toContain(
      "url.searchParams.append('channel_binding', 'require');",
    );
    expect(workflow).toContain("migration_direct_url=${migrationDirectUrl}");
    expect(workflow).toContain("runtime_pooled_url=${rotatedRuntimeUrl}");
    expect(workflow).toContain("platform_pooled_url=${rotatedPlatformUrl}");
    expect(
      workflow.match(
        /\$\{\{ steps\.neon_application_credentials\.outputs\.runtime_pooled_url \}\}/g,
      ),
    ).toHaveLength(4);
    expect(
      workflow.match(
        /\$\{\{ steps\.neon_application_credentials\.outputs\.platform_pooled_url \}\}/g,
      ),
    ).toHaveLength(4);
    expect(
      workflow.match(
        /\$\{\{ steps\.neon_application_credentials\.outputs\.migration_direct_url \}\}/g,
      ),
    ).toHaveLength(3);
  });

  it("emits safe stage diagnostics for Neon output and branch validation", () => {
    for (const stage of [
      "required outputs are present",
      "branch and endpoint topology match",
      "all role identities match",
      "TLS and channel binding are required",
      "database credentials are pairwise distinct",
      "branch metadata matches",
    ]) {
      expect(workflow).toContain(`Neon output validation: ${stage}.`);
    }
    expect(workflow).toContain(
      "Neon branch metadata validation failed for the expected id, root parent-schema source, name, or expiry.",
    );
    expect(workflow).toContain(".branch.parent_id == null");
    expect(workflow).toContain('.branch.init_source == "parent-schema"');
    expect(workflow).not.toContain(".branch.parent_id == $parent");
  });

  it("machine-attests cryptographically distinct preview and production signing keys", () => {
    expect(Object.keys(tenantContextKeyContract).sort()).toEqual([
      "preview",
      "production",
      "version",
    ]);
    expect(tenantContextKeyContract.version).toBe(1);
    const production = tenantContextKeyContract.production as Record<
      string,
      unknown
    >;
    const preview = tenantContextKeyContract.preview as Record<string, unknown>;
    for (const entry of [production, preview]) {
      expect(Object.keys(entry).sort()).toEqual(["keyId", "secretSha256"]);
      expect(entry.keyId).toMatch(/^[a-z0-9][a-z0-9._-]{0,31}$/);
      expect(entry.secretSha256).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(production.keyId).not.toBe(preview.keyId);
    expect(production.secretSha256).not.toBe(preview.secretSha256);

    for (const source of [workflow, productionWorkflow]) {
      expect(source).toContain(".github/tenant-context-key-contract.json");
      expect(source).toContain(
        "exactKeys(contract, ['version', 'production', 'preview']",
      );
      expect(source).toContain("productionFingerprint === previewFingerprint");
      expect(source).toContain("createHash('sha256')");
      expect(source).toContain(
        "This job deliberately has no GitHub Environment.",
      );
      expect(source).toContain(
        "PRODUCTION_TENANT_CONTEXT_SECRET_SHA256: ${{ needs.tenant-context-key-contract.outputs.production_fingerprint }}",
      );
      expect(source).toContain(
        "PREVIEW_TENANT_CONTEXT_SECRET_SHA256: ${{ needs.tenant-context-key-contract.outputs.preview_fingerprint }}",
      );
      expect(source).toContain(
        'TENANT_CONTEXT_KEY_ID_VALUE" != "$EXPECTED_TENANT_CONTEXT_KEY_ID',
      );
      expect(source).toContain(
        "Tracked tenant-context fingerprints do not match the shared repository pins.",
      );
      expect(source).toContain(
        "uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7",
      );
      expect(
        source.match(
          /\$\{\{ vars\.PRODUCTION_TENANT_CONTEXT_SIGNING_SECRET_SHA256 \}\}/g,
        ),
      ).toHaveLength(1);
      expect(
        source.match(
          /\$\{\{ vars\.PREVIEW_TENANT_CONTEXT_SIGNING_SECRET_SHA256 \}\}/g,
        ),
      ).toHaveLength(1);
    }
    expect(workflow).toContain(
      "ref: ${{ github.event.pull_request.head.sha }}",
    );
    expect(productionWorkflow).toContain(
      "ref: ${{ github.event.workflow_run.head_sha }}",
    );
  });

  it("pins each deployment and verification to its database region", () => {
    expect(workflow).toContain("--regions iad1");
    expect(workflow).toContain("EXPECTED_VERCEL_REGION: iad1");
    expect(productionWorkflow).toContain("--regions sin1");
    expect(productionWorkflow).toContain("EXPECTED_VERCEL_REGION: sin1");
  });

  it("requires the exact Free production root and its direct endpoint", () => {
    const bindingStart = productionWorkflow.indexOf(
      "Bind the production URL to the configured Neon project and root branch",
    );
    const bindingEnd = productionWorkflow.indexOf(
      "Checkout the successful main commit",
    );
    const bindingGate = productionWorkflow.slice(bindingStart, bindingEnd);

    expect(bindingStart).toBeGreaterThan(0);
    expect(bindingEnd).toBeGreaterThan(bindingStart);
    for (const exactRootCheck of [
      ".branch.id == $branch",
      ".branch.project_id == $project",
      ".branch.parent_id == null",
      ".branch.default == true",
      ".branch.protected == false",
      '.branch.current_state == "ready"',
      ".branch.pending_state == null",
    ]) {
      expect(bindingGate).toContain(exactRootCheck);
    }
    for (const exactEndpointCheck of [
      ".project_id == $project",
      ".branch_id == $branch",
      '.type == "read_write"',
      ".host == $host",
      ".disabled == false",
      '(.current_state == "active" or .current_state == "idle")',
      ".pending_state == null",
    ]) {
      expect(bindingGate).toContain(exactEndpointCheck);
    }
  });

  it("creates a no-endpoint rolling recovery branch before migration", () => {
    const checkpointMutation = productionWorkflow.indexOf(
      "Create and verify Free-tier recovery branch checkpoint",
    );
    const migrationMutation = productionWorkflow.indexOf(
      "Apply locked production migrations",
    );

    expect(checkpointMutation).toBeGreaterThan(0);
    expect(migrationMutation).toBeGreaterThan(checkpointMutation);
    expect(productionWorkflow).toContain(
      "node scripts/create-neon-free-recovery-checkpoint.mjs",
    );
    expect(productionWorkflow).toContain(
      "neon-pre-migration-recovery-checkpoint-${{ github.run_id }}-${{ github.run_attempt }}",
    );
    expect(productionWorkflow).toContain(
      "TRIGGER_WORKFLOW_CREATED_AT: ${{ github.event.workflow_run.created_at }}",
    );
    expect(productionWorkflow).toContain(
      'date -u -d "$TRIGGER_WORKFLOW_CREATED_AT +7 days"',
    );
    expect(productionWorkflow).toContain(
      "RECOVERY_CHECKPOINT_ID: ${{ steps.checkpoint.outputs.checkpoint_id }}",
    );
    expect(productionWorkflow).not.toContain("/snapshots");
  });

  it("pins the exact tenant and platform role identities in both workflows", () => {
    expect(productionWorkflow).toContain(
      "NEON_RUNTIME_ROLE must equal school_sis_runtime.",
    );
    expect(productionWorkflow).toContain(
      "NEON_PLATFORM_ROLE must equal school_sis_platform.",
    );
    expect(workflow).toContain(
      "NEON_PREVIEW_RUNTIME_ROLE must equal school_sis_runtime.",
    );
    expect(workflow).toContain(
      "NEON_PREVIEW_PLATFORM_ROLE must equal school_sis_platform.",
    );
  });

  it("validates each complete key-rotation contract before provider work", () => {
    for (const source of [workflow, productionWorkflow]) {
      expect(source).toContain(
        "TENANT_CONTEXT_PREVIOUS_KEY_ID_VALUE: ${{ vars.TENANT_CONTEXT_PREVIOUS_KEY_ID }}",
      );
      expect(source).toContain(
        "TENANT_CONTEXT_PREVIOUS_SECRET_VALUE: ${{ secrets.TENANT_CONTEXT_PREVIOUS_SIGNING_SECRET }}",
      );
      expect(source).toContain(
        "TENANT_CONTEXT_RETIRE_PREVIOUS_KEY_VALUE: ${{ vars.TENANT_CONTEXT_RETIRE_PREVIOUS_KEY }}",
      );
      for (const expectedFailure of [
        "must be configured together",
        "TENANT_CONTEXT_PREVIOUS_KEY_ID has an invalid rotation identifier",
        "TENANT_CONTEXT_PREVIOUS_SIGNING_SECRET must be a 43-128 character base64url secret",
        "Current and previous tenant-context key IDs must differ",
        "Current and previous tenant-context secrets must differ",
        "TENANT_CONTEXT_RETIRE_PREVIOUS_KEY must be unset or exactly true",
        "TENANT_CONTEXT_RETIRE_PREVIOUS_KEY=true cannot be combined with a previous verification key",
      ]) {
        expect(source).toContain(expectedFailure);
      }
    }

    for (const [source, configurationName, firstProviderStep] of [
      [
        workflow,
        "Fail closed on missing preview configuration",
        "Prove Vercel preview token project isolation",
      ],
      [
        productionWorkflow,
        "Fail closed on missing production configuration",
        "Bind the production URL to the configured Neon project and root branch",
      ],
    ] as const) {
      const configurationGate = source.indexOf(configurationName);
      const providerGate = source.indexOf(firstProviderStep);
      expect(configurationGate).toBeGreaterThan(0);
      expect(providerGate).toBeGreaterThan(configurationGate);
    }
    expect(
      productionWorkflow.indexOf(
        "Create and verify Free-tier recovery branch checkpoint",
      ),
    ).toBeGreaterThan(
      productionWorkflow.indexOf(
        "Fail closed on missing production configuration",
      ),
    );
  });

  it("fails production closed on protected-main merge and solo-owner provenance", () => {
    expect(productionWorkflow).toContain("pull-requests: read");
    expect(productionWorkflow).toContain(
      "Verify protected main release provenance",
    );
    expect(productionWorkflow).toContain(
      "Re-verify protected main before Neon mutation",
    );
    expect(
      productionWorkflow.match(
        /node scripts\/verify-production-release-provenance\.mjs/g,
      ),
    ).toHaveLength(4);
    expect(productionProvenanceGate).toContain("branch?.protected !== true");
    expect(productionProvenanceGate).toContain(
      "pullRequest?.merge_commit_sha?.toLowerCase() === options.sha",
    );
    expect(productionProvenanceGate).toContain(
      "pullRequest?.head?.repo?.full_name?.toLowerCase()",
    );
    expect(productionProvenanceGate).toContain(
      "const soloReleaseOwner = readSoloReleaseOwner(options)",
    );
    expect(productionProvenanceGate).not.toContain("/actions/variables/");
    expect(productionProvenanceGate).toContain(
      "pullRequest?.user?.login !== soloReleaseOwner",
    );
    expect(productionProvenanceGate).toContain(
      'payload?.permission !== "admin"',
    );
    expect(productionProvenanceGate).toContain(
      "/collaborators?affiliation=all",
    );
    expect(productionProvenanceGate).toContain("pushCapable.length !== 1");
    expect(productionProvenanceGate).not.toContain("/reviews");

    const lateGate = productionWorkflow.indexOf(
      "Re-verify protected main before Neon mutation",
    );
    const checkpointMutation = productionWorkflow.indexOf(
      "Create and verify Free-tier recovery branch checkpoint",
    );
    expect(lateGate).toBeGreaterThan(0);
    expect(checkpointMutation).toBeGreaterThan(lateGate);
  });

  it("keeps API response bodies private and removes them", () => {
    expect(workflow).toContain("umask 077");
    expect(workflow).toContain(
      'trap \'rm -f "$preview_response" "$production_response"\' EXIT',
    );
    expect(workflow).not.toContain('cat "$preview_response"');
    expect(workflow).not.toContain('cat "$production_response"');
  });

  it("rejects database and tenant-context credentials embedded in the artifact", () => {
    expect(workflow).toContain(
      "const databaseVariables = [\n            'DATABASE_URL',\n            'PLATFORM_DATABASE_URL',\n            'DIRECT_URL'",
    );
    expect(workflow).toContain(
      "process.env.TENANT_CONTEXT_PREVIOUS_SIGNING_SECRET",
    );
    expect(workflow).toContain(
      "The preview build output contains a protected credential.",
    );
  });
});
