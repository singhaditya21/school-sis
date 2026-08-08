export const ALLOWED_AGENT_IDS = [
  'synthesis',
  'fee',
  'attend',
  'academ',
  'risk',
  'crisis',
] as const;

export type AllowedAgentId = (typeof ALLOWED_AGENT_IDS)[number];

const allowedAgentIds = new Set<string>(ALLOWED_AGENT_IDS);

export const REQUIRED_EXTERNAL_AGENT_EVAL_CATEGORIES = [
  'prompt_injection',
  'tenant_leakage',
  'hallucination_groundedness',
  'unsafe_tool_use',
  'retrieval_grounding',
] as const;

export type ExternalAgentReleaseManifest = Readonly<{
  serviceVersion: string;
  evalArtifactSha256: string;
  passedCategories: readonly string[];
  approvedAgentIds: readonly AllowedAgentId[];
}>;

/**
 * The external Python agent runtime is not shipped in this repository, so it
 * stays unreachable until a reviewed change checks in a versioned release and
 * the SHA-256 of its passing red-team/eval artifact. Credentials alone must
 * never turn an unevaluated tool/retrieval surface into a live ingress.
 */
export const EXTERNAL_AGENT_RELEASE: ExternalAgentReleaseManifest | null = null;

export function approvedExternalAgentRelease(): ExternalAgentReleaseManifest | null {
  const release = EXTERNAL_AGENT_RELEASE;
  if (!release) return null;
  if (!/^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(release.serviceVersion)) return null;
  if (!/^[a-f0-9]{64}$/i.test(release.evalArtifactSha256)) return null;
  if (!REQUIRED_EXTERNAL_AGENT_EVAL_CATEGORIES.every((category) => release.passedCategories.includes(category))) {
    return null;
  }
  if (
    release.approvedAgentIds.length === 0
    || release.approvedAgentIds.some((agentId) => !allowedAgentIds.has(agentId))
  ) {
    return null;
  }
  return release;
}

export function requireApprovedExternalAgentRelease(): ExternalAgentReleaseManifest {
  const release = approvedExternalAgentRelease();
  if (!release) {
    throw new Error(
      'External agent service is release-gated until a versioned, passing tool/retrieval eval artifact is reviewed.',
    );
  }
  return release;
}

export function isAgentApprovedForRelease(
  release: ExternalAgentReleaseManifest,
  agentId: AllowedAgentId,
): boolean {
  return release.approvedAgentIds.includes(agentId);
}

export function requireApprovedExternalAgent(agentId: AllowedAgentId): ExternalAgentReleaseManifest {
  const release = requireApprovedExternalAgentRelease();
  if (!isAgentApprovedForRelease(release, agentId)) {
    throw new Error(`External agent '${agentId}' is not approved by the reviewed release manifest.`);
  }
  return release;
}

export function isAllowedAgentId(value: string): value is AllowedAgentId {
  return allowedAgentIds.has(value);
}
