# School SIS - DevOps & Deployment Documentation

This document covers the local setup, database management, environment configuration, and Vercel deployment pipeline for the School SIS platform.

## 1. Local Setup

The School SIS platform operates as a monorepo powered by Turborepo and `pnpm`. The web application is built with Next.js, and external observability services are managed via Docker Compose.

### Prerequisites
- [Node.js](https://nodejs.org/) (LTS recommended)
- [pnpm](https://pnpm.io/) (v9.15.9+)
- [Docker & Docker Compose](https://www.docker.com/)

### Starting External Services
We use Docker Compose to run infrastructure services locally (Prometheus, Grafana, and Alertmanager). 
From the root directory, start the containers:

```bash
pnpm run docker:up
# Or directly: docker-compose up -d
```
- **Grafana**: Available at `http://localhost:3001`
- **Prometheus**: Available at `http://localhost:9090`
- **Alertmanager**: Available at `http://localhost:9093`

### Starting the Development Server
Install dependencies and run the development server using Turborepo:

```bash
pnpm install
pnpm run dev
```

This will concurrently start all applications and packages specified in the workspace.

## 2. Database Management

The platform utilizes **Neon Postgres** for a scalable, serverless PostgreSQL database. We use **Drizzle ORM** for schema definition, migrations, and database interactions within the `apps/web` package.

All database commands should be run from within `apps/web` or using `pnpm --filter web <command>`.

### Key Commands

- **Generate Migrations**:
  Generates SQL migration files based on schema changes (`./src/lib/db/schema/index.ts`).
  ```bash
  pnpm db:generate
  ```

- **Push Schema**:
  Directly pushes schema changes to the database without generating migration files. Useful for rapid local prototyping.
  ```bash
  pnpm db:push
  ```

- **Run Migrations**:
  Applies the generated SQL migration files to the database (recommended for production).
  ```bash
  pnpm db:migrate
  ```

- **Seed Database**:
  Populates the database with initial/dummy data via `scripts/seed.ts`.
  ```bash
  pnpm db:seed
  ```

- **Drizzle Studio**:
  Provides a local web-based UI to browse and manage your database records.
  ```bash
  pnpm db:studio
  ```

## 3. Environment Variables

Below are the core environment variables required for the application to function properly. Configure these in your `.env` (or `.env.local`) file during local development, and in your hosting provider's dashboard for production.

### General & Database
```env
# Database connection for Neon Postgres
# Use the pooled connection string for DATABASE_URL and the direct one for DIRECT_URL (required by Drizzle for migrations)
DATABASE_URL=postgresql://[user]:[password]@[host]/[dbname]?sslmode=require
DIRECT_URL=postgresql://[user]:[password]@[host]/[dbname]?sslmode=require

# Application Secrets
SESSION_SECRET=your_32_char_session_secret
ENCRYPTION_KEY=your_32_char_encryption_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Third-Party Integrations
The following variables are required to integrate with external providers as per the requested configuration:

```env
# Stripe (Payments)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Twilio (SMS / Voice)
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=...

# MSG91 (Alternative SMS Provider)
MSG91_AUTH_KEY=...
MSG91_TEMPLATE_ID=...

# WorkOS (SSO & Identity)
WORKOS_API_KEY=sk_...
WORKOS_CLIENT_ID=client_...
```

## 4. Vercel Deployment Pipeline

The School SIS web application (`apps/web`) is optimized for deployment on Vercel.

### Deployment Steps

1. **Import Project**: In the Vercel dashboard, import the connected GitHub repository.
2. **Framework Preset**: Vercel should automatically detect **Next.js**.
3. **Root Directory**: Leave the root directory as the default (the repository root). Turborepo integration is handled natively by Vercel.
4. **Build Settings**: 
   Vercel will detect Turborepo and use the correct commands automatically. Ensure the settings match:
   - **Build Command**: `pnpm run build` (or `turbo run build`)
   - **Install Command**: `pnpm install`
   - **Output Directory**: Vercel handles this for Next.js (`apps/web/.next`)
5. **Environment Variables**: Add all the required environment variables listed in section 3. Make sure to use production keys for production deployments.

### Continuous Integration
- Every push to a pull request triggers a preview deployment.
- Pushes to the `main` branch trigger a production build.
- Database migrations (`pnpm db:migrate`) can be configured to run as a custom build step in the `package.json` or handled manually/via GitHub Actions prior to a Vercel production deployment.
