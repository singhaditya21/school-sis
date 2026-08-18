#!/usr/bin/env node

import process from "node:process";
import { pathToFileURL } from "node:url";

const GITHUB_API_VERSION = "2022-11-28";
const GITHUB_LOGIN_PATTERN = /^[A-Za-z0-9-]{1,39}$/;

function usage() {
  return `Usage: node scripts/verify-production-release-provenance.mjs [options]

Required (flag or matching environment variable):
  --repository OWNER/REPO       GITHUB_REPOSITORY
  --sha 40_HEX_SHA              TARGET_SHA

Options:
  --ref BRANCH                  EXPECTED_HEAD_BRANCH (default: main)

Authentication is read only and must be supplied through GITHUB_TOKEN. The
token is never accepted as a command-line argument or printed. The repository
owner is the exact solo release owner and must still have admin permission.`;
}

export function parseArgs(argv, env = process.env) {
  const values = new Map();
  const allowedOptions = new Set(["repository", "sha", "ref"]);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") return { help: true };
    if (!argument.startsWith("--")) {
      throw new Error(`Unexpected argument: ${argument}`);
    }
    const name = argument.slice(2);
    if (!allowedOptions.has(name)) throw new Error(`Unknown option --${name}.`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${name}.`);
    }
    if (values.has(name)) throw new Error(`Duplicate option --${name}.`);
    values.set(name, value);
    index += 1;
  }

  const repository = values.get("repository") ?? env.GITHUB_REPOSITORY;
  const sha = (values.get("sha") ?? env.TARGET_SHA ?? "").toLowerCase();
  const ref = values.get("ref") ?? env.EXPECTED_HEAD_BRANCH ?? "main";
  const token = env.GITHUB_TOKEN;

  if (!repository || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error("repository must use the OWNER/REPO form.");
  }
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error("sha must be a full 40-character Git commit SHA.");
  }
  if (!ref || !/^[A-Za-z0-9._/-]+$/.test(ref) || ref.includes("..")) {
    throw new Error("ref contains unsupported characters.");
  }
  if (!token) throw new Error("GITHUB_TOKEN is required.");

  return { help: false, repository, sha, ref, token };
}

function apiUrl(path) {
  return new URL(path, "https://api.github.com").toString();
}

function githubHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "school-sis-production-provenance-gate",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
  };
}

function apiFailure(response) {
  const requestId = response.headers.get("x-github-request-id");
  return new Error(
    `GitHub API request failed with HTTP ${response.status}${requestId ? ` (request ${requestId})` : ""}.`,
  );
}

async function githubJson(path, token, fetchImpl) {
  const response = await fetchImpl(apiUrl(path), {
    headers: githubHeaders(token),
  });
  if (!response.ok) throw apiFailure(response);
  return response.json();
}

async function githubList(path, token, fetchImpl) {
  const results = [];
  for (let page = 1; page <= 20; page += 1) {
    const separator = path.includes("?") ? "&" : "?";
    const payload = await githubJson(
      `${path}${separator}per_page=100&page=${page}`,
      token,
      fetchImpl,
    );
    if (!Array.isArray(payload)) {
      throw new Error("GitHub API returned an unexpected list payload.");
    }
    results.push(...payload);
    if (payload.length < 100) return results;
  }
  throw new Error(
    "GitHub API pagination exceeded the fail-closed 2,000-item limit.",
  );
}

function readSoloReleaseOwner(options) {
  const repositoryOwner = options.repository.slice(
    0,
    options.repository.indexOf("/"),
  );
  if (!GITHUB_LOGIN_PATTERN.test(repositoryOwner)) {
    throw new Error("The repository owner is not a canonical GitHub login.");
  }
  return repositoryOwner;
}

async function requireCurrentAdmin(options, owner, fetchImpl) {
  const payload = await githubJson(
    `/repos/${options.repository}/collaborators/${encodeURIComponent(owner)}/permission`,
    options.token,
    fetchImpl,
  );
  if (payload?.user?.login !== owner || payload?.permission !== "admin") {
    throw new Error(
      "The solo repository owner must still have exact admin permission.",
    );
  }
}

async function requireSoloRepositoryTopology(options, owner, fetchImpl) {
  const collaborators = await githubList(
    `/repos/${options.repository}/collaborators?affiliation=all`,
    options.token,
    fetchImpl,
  );
  const pushCapable = collaborators.filter(
    (collaborator) =>
      collaborator?.permissions?.push === true ||
      collaborator?.permissions?.maintain === true ||
      collaborator?.permissions?.admin === true,
  );
  if (
    pushCapable.length !== 1 ||
    pushCapable[0]?.login !== owner ||
    pushCapable[0]?.permissions?.admin !== true
  ) {
    throw new Error(
      "Solo release policy requires exactly one push-capable collaborator: the repository owner with admin permission.",
    );
  }
}

export async function verifyProductionReleaseProvenance(
  options,
  dependencies = {},
) {
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required.");
  }

  const soloReleaseOwner = readSoloReleaseOwner(options);

  const encodedRef = options.ref.split("/").map(encodeURIComponent).join("/");
  const branch = await githubJson(
    `/repos/${options.repository}/branches/${encodedRef}`,
    options.token,
    fetchImpl,
  );
  if (branch?.name !== options.ref || branch?.protected !== true) {
    throw new Error(
      `Ref ${options.ref} is not reported as a protected branch; refusing production release.`,
    );
  }
  if (branch?.commit?.sha?.toLowerCase() !== options.sha) {
    throw new Error(
      `Protected ref ${options.ref} no longer points to the requested SHA; refusing a stale production release.`,
    );
  }

  const pullRequests = await githubList(
    `/repos/${options.repository}/commits/${options.sha}/pulls`,
    options.token,
    fetchImpl,
  );
  const mergedCandidates = pullRequests.filter(
    (pullRequest) =>
      pullRequest?.state === "closed" &&
      typeof pullRequest?.merged_at === "string" &&
      pullRequest.merged_at.length > 0 &&
      pullRequest?.base?.ref === options.ref &&
      pullRequest?.base?.repo?.full_name?.toLowerCase() ===
        options.repository.toLowerCase() &&
      pullRequest?.head?.repo?.full_name?.toLowerCase() ===
        options.repository.toLowerCase() &&
      pullRequest?.merge_commit_sha?.toLowerCase() === options.sha,
  );
  if (mergedCandidates.length !== 1) {
    throw new Error(
      `Target SHA must be the exact merge_commit_sha of exactly one merged pull request into ${options.ref}.`,
    );
  }

  const pullRequest = mergedCandidates[0];
  if (!Number.isSafeInteger(pullRequest.number) || pullRequest.number < 1) {
    throw new Error("Merged pull request has an invalid number.");
  }
  const headSha = pullRequest?.head?.sha?.toLowerCase();
  if (!headSha || !/^[0-9a-f]{40}$/.test(headSha)) {
    throw new Error("Merged pull request has an invalid head SHA.");
  }
  if (pullRequest?.user?.login !== soloReleaseOwner) {
    throw new Error(
      "The exact merged pull request must be authored by the solo repository owner.",
    );
  }
  const mergedAt = Date.parse(pullRequest.merged_at);
  if (!Number.isFinite(mergedAt)) {
    throw new Error("Merged pull request has an invalid merge timestamp.");
  }

  await requireCurrentAdmin(options, soloReleaseOwner, fetchImpl);
  await requireSoloRepositoryTopology(options, soloReleaseOwner, fetchImpl);
  return {
    pullRequestNumber: pullRequest.number,
    pullRequestHeadSha: headSha,
    soloReleaseOwner,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  const result = await verifyProductionReleaseProvenance(options);
  console.log(
    `Verified protected ${options.ref} merge provenance for PR #${result.pullRequestNumber} at ${options.sha.slice(0, 12)}.`,
  );
}

const isMain =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  main().catch((error) => {
    console.error(
      `Production provenance gate failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    process.exitCode = 1;
  });
}
