# Continue School SIS on another laptop

The GitHub repository is the source of truth for application code, database
migrations, dependency patches, tests, documentation, and the exact pnpm
dependency lockfile. A fresh checkout can install and build without copying any
secret or local database from the previous laptop.

## Current handoff

- Repository: `singhaditya21/school-sis`
- Work branch: `agent/remaining-p1-roadmap`
- Pull request: [#57](https://github.com/singhaditya21/school-sis/pull/57)
- Base branch: `main`

Until pull request #57 is merged, switch to the work branch explicitly. After
it is merged, a fresh clone of `main` contains the same work.

## 1. Install the toolchain

Install Git and Node.js 24. The repository's `.nvmrc` selects the same Node
major version used by GitHub Actions.

With `nvm`:

```sh
nvm install
nvm use
corepack enable
corepack install --global pnpm@9.15.9
```

If the Node distribution does not include Corepack, install the pinned package
manager with `npm install --global pnpm@9.15.9` instead.

On Windows, use WSL2 for the local PostgreSQL scripts. A source-only build also
works from PowerShell once Git, Node 24, and pnpm 9.15.9 are available.

## 2. Clone the exact work from GitHub

```sh
git clone git@github.com:singhaditya21/school-sis.git
cd school-sis
git switch agent/remaining-p1-roadmap
git pull --ff-only
```

If SSH is not configured on the new laptop, use the HTTPS clone URL and sign in
through GitHub's credential manager:

```sh
git clone https://github.com/singhaditya21/school-sis.git
```

Do not paste a personal access token into a file or a Git remote URL.

## 3. Reproduce the source-only build

```sh
pnpm install --frozen-lockfile
pnpm build:portable
```

`build:portable` deliberately does not require `.env.local`, PostgreSQL, or
provider credentials. It proves that the tracked source builds. Runtime and
production startup still require their real environment configuration.

Optional checks matching the pull-request gates:

```sh
pnpm audit:hygiene
pnpm --filter @school-sis/web exec tsc --noEmit --pretty false --incremental false
pnpm test:unit
```

## 4. Run the full application locally

The full local application uses a project-local PostgreSQL 16 cluster with
pgvector. On macOS:

```sh
brew install postgresql@16
./scripts/install-pgvector.sh
pnpm local:setup
pnpm dev
```

Building pgvector also requires Git, `make`, a C compiler, and PostgreSQL 16
headers. On macOS, install the Xcode Command Line Tools if the compiler is
missing. The checked-in scripts include both common Homebrew PostgreSQL 16
binary paths.

`pnpm local:setup` creates `apps/web/.env.local` from the committed
`apps/web/.env.example`, initializes `.pgdata`, applies the schema, and seeds
demo data. Both generated paths remain local and are intentionally ignored by
Git.

See [RUNNING.md](../RUNNING.md) for everyday database and scheduler commands.

## What is intentionally not stored in GitHub

These items are machine-specific, generated, or secret and must not be committed:

- `node_modules`, `.next`, `.turbo`, test output, and audit output
- `.pgdata` and other local database contents
- `.env.local` and all real API keys, passwords, tokens, and encryption keys
- uploaded user files and backups

They are reproducible or must be supplied securely:

- Dependencies come from `pnpm-lock.yaml` via `pnpm install --frozen-lockfile`.
- Build output comes from `pnpm build:portable`.
- A local database and demo records come from `pnpm local:setup`.
- Real deployment secrets belong in the deployment provider or a password
  manager. Transfer them separately only if that environment is needed.
- Persistent production data and uploads require their own approved backup and
  restore process; Git is not a database backup system.

## Confirm the laptop is on the synced revision

```sh
git status --short --branch
git rev-parse HEAD
git ls-remote origin refs/heads/agent/remaining-p1-roadmap
```

The worktree should be clean, and the two commit hashes should match. After PR
#57 is merged, compare `HEAD` with `refs/heads/main` instead.
