#!/usr/bin/env node

/**
 * Say what the database is ahead of, when the code has been rolled back.
 *
 * A Vercel rollback moves production to an earlier deployment. It does not undo
 * migrations, and this release deliberately does not try to: the rollback step
 * says the Neon recovery branch "is retained for manual database recovery" and
 * stops there. That is the right call — an automatic schema revert during an
 * incident is how you turn an outage into data loss.
 *
 * But it left the operator with a branch id and nothing else. Not which
 * migrations the database has that the running code predates, nor whether there
 * is any divergence at all. The single most useful fact in that moment — is the
 * database ahead of the code, and by what — was the one nobody stated.
 *
 * So: read what the database has actually applied, read what the commit
 * production is NOW SERVING expected to be applied, and report the difference
 * by name.
 *
 *   DIRECT_URL=... node apps/web/scripts/report-database-drift.mjs \
 *     --live-sha <sha production serves> [--attempted-sha <sha this release built>]
 *
 * Never fails: it runs after something has already gone wrong, and a diagnostic
 * that throws restores exactly the silence it exists to end.
 */

import { execFileSync } from 'node:child_process';
import pg from 'pg';

const MANIFEST_PATH = 'apps/web/src/generated/migration-manifest.ts';

export function parseArgs(argv, env = process.env) {
  const values = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument ${arg}.`);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      throw new Error(`Option ${arg} needs a value.`);
    }
    values.set(arg.slice(2), next);
    i += 1;
  }
  const connectionString = env.DIRECT_URL || env.DATABASE_URL || '';
  if (!connectionString) throw new Error('DIRECT_URL or DATABASE_URL is required.');
  return {
    connectionString,
    liveSha: values.get('live-sha') ?? '',
    attemptedSha: values.get('attempted-sha') ?? '',
  };
}

/**
 * The migration tags a given commit expected to exist.
 *
 * Read out of git rather than the working tree: the point is to compare against
 * what the DEPLOYED commit believed, and the working tree is the commit that
 * failed. Parsed with a regex rather than imported because it is a TypeScript
 * module at an arbitrary revision.
 */
export function manifestTagsAt(sha, runGit = defaultRunGit) {
  if (!/^[0-9a-f]{7,40}$/i.test(sha)) return null;
  let source;
  try {
    source = runGit(['show', `${sha}:${MANIFEST_PATH}`]);
  } catch {
    // A shallow clone, or a commit that predates the manifest.
    return null;
  }
  const tags = [...source.matchAll(/"tag":\s*"([^"]+)"/g)].map((m) => m[1]);
  return tags.length > 0 ? tags : null;
}

function defaultRunGit(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
}

/**
 * Compare what the database applied against what the running code expected.
 *
 * Hashes identify a migration; tags name it. The ledger stores hashes, the
 * manifest stores both, so the manifest of the ATTEMPTED commit is used to turn
 * an applied hash into a human-readable tag. Without it a hash is reported
 * as-is, which is still better than silence.
 */
export function describeDrift({ appliedHashes, liveTags, attemptedManifest }) {
  const hashToTag = new Map((attemptedManifest ?? []).map((m) => [m.hash, m.tag]));
  const appliedTags = appliedHashes.map((hash) => hashToTag.get(hash) ?? `<hash ${hash.slice(0, 12)}>`);

  if (!liveTags) {
    return {
      known: false,
      appliedCount: appliedHashes.length,
      ahead: [],
      lines: [
        `The database has ${appliedHashes.length} migration(s) applied.`,
        'The running deployment’s migration manifest could not be read, so whether the',
        'database is ahead of it is UNKNOWN. Compare by hand before assuming it is safe.',
      ],
    };
  }

  const liveSet = new Set(liveTags);
  const ahead = appliedTags.filter((tag) => !liveSet.has(tag));

  if (ahead.length === 0) {
    return {
      known: true,
      appliedCount: appliedHashes.length,
      ahead,
      lines: [
        `The database has ${appliedHashes.length} migration(s) applied, and the running`,
        'deployment expects every one of them. Schema and code agree.',
      ],
    };
  }

  return {
    known: true,
    appliedCount: appliedHashes.length,
    ahead,
    lines: [
      'THE DATABASE IS AHEAD OF THE RUNNING CODE.',
      `  applied         : ${appliedHashes.length} migration(s)`,
      `  running code knows: ${liveTags.length}`,
      '  applied but unknown to the deployment now serving production:',
      ...ahead.map((tag) => `    - ${tag}`),
      '',
      'The rollback moved the code back; it did not move the schema. Nothing here is',
      'automatically reversible — restoring from the retained Neon recovery branch is a',
      'deliberate, manual decision, and a forward fix is often the safer one.',
    ],
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const client = new pg.Client({
    connectionString: options.connectionString,
    ssl: /sslmode=disable/.test(options.connectionString) ? false : undefined,
  });
  await client.connect();

  let appliedHashes = [];
  try {
    const { rows } = await client.query(
      'SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at ASC, id ASC',
    );
    appliedHashes = rows.map((row) => row.hash);
  } finally {
    await client.end();
  }

  const attemptedManifest = options.attemptedSha
    ? readManifest(options.attemptedSha)
    : readManifest('HEAD');
  const liveTags = manifestTagsAt(options.liveSha);

  const drift = describeDrift({ appliedHashes, liveTags, attemptedManifest });
  const text = drift.lines.join('\n');
  console.log(text);

  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFile } = await import('node:fs/promises');
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `\n### Database and code\n\n${text}\n`);
  }
}

function readManifest(sha) {
  try {
    const source = defaultRunGit(['show', `${sha}:${MANIFEST_PATH}`]);
    return [...source.matchAll(/"tag":\s*"([^"]+)",\s*"createdAt":\s*"[^"]*",\s*"hash":\s*"([^"]+)"/g)].map(
      (m) => ({ tag: m[1], hash: m[2] }),
    );
  } catch {
    return null;
  }
}

const RUNNING_AS_CLI =
  process.argv[1] && process.argv[1].endsWith('report-database-drift.mjs');

if (RUNNING_AS_CLI) {
  main().catch((error) => {
    // Never fail: this runs when something has already gone wrong.
    console.error(`Could not report database drift: ${error.message}`);
    process.exit(0);
  });
}
