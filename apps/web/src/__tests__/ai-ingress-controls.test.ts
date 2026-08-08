import fs from 'node:fs';
import path from 'node:path';
import { ensureAgentServiceConfigured } from '@/lib/agents/client';
import {
  isAgentApprovedForRelease,
  type ExternalAgentReleaseManifest,
} from '@/lib/agents/policy';

const WEB_ROOT = process.cwd();
const REPO_ROOT = path.resolve(WEB_ROOT, '../..');

function webSource(relativePath: string): string {
  return fs.readFileSync(path.join(WEB_ROOT, relativePath), 'utf8');
}

function repoSource(relativePath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

describe('AI ingress governance contract', () => {
  it.each([
    'src/app/api/copilot/route.ts',
    'src/app/api/chat/route.ts',
    'src/app/api/agents/[agent]/query-async/route.ts',
  ])('enforces prompt assessment and tenant/user budget reservation: %s', (file) => {
    const contents = webSource(file);
    expect(contents).toContain('assessAiPrompt');
    expect(contents).toContain('reserveAiBudget');
    expect(contents).toContain('settleAiBudget');
    expect(contents).toContain('auth.context.tenantId');
    expect(contents).toContain('auth.context.userId');
  });

  it('grounds copilot context and tool output in the tenant catalog', () => {
    const contents = webSource('src/app/api/copilot/route.ts');
    expect(contents).toContain('runWithTenantContext');
    expect(contents).toContain('o.tenant_id = $1');
    expect(contents).toContain('fp.can_read = TRUE');
    expect(contents).toContain('validateGroundedReportAst');
    expect(contents).toContain('maxRetries: 0');
  });

  it('rejects arbitrary agent selection before the external gateway', () => {
    const route = webSource('src/app/api/agents/[agent]/query-async/route.ts');
    const policy = webSource('src/lib/agents/policy.ts');
    expect(route).toContain('isAllowedAgentId(agent)');
    expect(route).toContain("status: 404");
    expect(policy).toContain("'synthesis'");
    expect(policy).not.toContain("'refund_invoice'");
  });

  it('keeps the unversioned external agent runtime gated even when credentials exist', () => {
    const originalUrl = process.env.AGENT_SERVICE_URL;
    const originalToken = process.env.AGENT_API_TOKEN;
    process.env.AGENT_SERVICE_URL = 'https://agents.example.edu';
    process.env.AGENT_API_TOKEN = 'test-token-that-is-at-least-32-characters-long';
    try {
      expect(() => ensureAgentServiceConfigured('synthesis')).toThrow(/release-gated.*eval artifact/i);
    } finally {
      if (originalUrl === undefined) delete process.env.AGENT_SERVICE_URL;
      else process.env.AGENT_SERVICE_URL = originalUrl;
      if (originalToken === undefined) delete process.env.AGENT_API_TOKEN;
      else process.env.AGENT_API_TOKEN = originalToken;
    }
  });

  it('allows only agent ids explicitly named by a reviewed external release', () => {
    const release: ExternalAgentReleaseManifest = {
      serviceVersion: '1.2.3',
      evalArtifactSha256: 'a'.repeat(64),
      passedCategories: [
        'prompt_injection',
        'tenant_leakage',
        'hallucination_groundedness',
        'unsafe_tool_use',
        'retrieval_grounding',
      ],
      approvedAgentIds: ['synthesis'],
    };

    expect(isAgentApprovedForRelease(release, 'synthesis')).toBe(true);
    expect(isAgentApprovedForRelease(release, 'fee')).toBe(false);
  });

  it('uses conditional atomic counters for both budget scopes', () => {
    const contents = webSource('src/lib/ai/budget.ts');
    expect(contents).toContain('ON CONFLICT (scope_kind, scope_id, period_start) DO UPDATE');
    expect(contents).toContain('<= $7');
    expect(contents).toContain('<= $8');
    expect(contents).toContain("scopeKind: 'TENANT'");
    expect(contents).toContain("scopeKind: 'USER'");
  });

  it('ships immediate RLS protection and a latest-snapshot policy gate', () => {
    const migration = repoSource('apps/web/drizzle/0001_concerned_lily_hollister.sql');
    const matrixGate = repoSource('scripts/check-rls-policy-matrix.mjs');
    expect(migration).toContain('ALTER TABLE "ai_budget_usage" ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('ALTER TABLE "ai_budget_usage" FORCE ROW LEVEL SECURITY');
    expect(migration).toContain('CREATE POLICY "tenant_isolation_policy" ON "ai_budget_usage"');
    expect(matrixGate).toContain("/^\\d{4}_snapshot\\.json$/");
    expect(matrixGate).toContain('latestSnapshotFile');
  });

  it('runs and uploads the AI eval artifact in CI', () => {
    const workflow = repoSource('.github/workflows/ci.yml');
    expect(workflow).toContain('pnpm test:ai-evals');
    expect(workflow).toContain('apps/web/artifacts/ai-evals/results.json');
  });
});
