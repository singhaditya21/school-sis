# Quick Start Guide

## Prerequisites Check

Before starting, ensure you have:

- [ ] Node.js 20+ installed (`node --version`)
- [ ] Docker Desktop installed and running
- [ ] Git Bash or WSL for OpenSSL commands

## Setup Steps

### 1. Install Package Manager

Choose one:

**Option A: pnpm (recommended)**

```bash
npm install -g pnpm
```

**Option B: Use npm (already installed)**

```bash
# No action needed, use npm instead of pnpm
```

### 2. Navigate to Project

```bash
cd d:\singhaditya21.github.io\school-sis
```

### 3. Install Dependencies

With pnpm:

```bash
pnpm install
```

Or with npm:

```bash
cd apps/web
npm install
```

### 4. Setup Environment Variables

```bash
# Copy template
cp .env.example apps/web/.env
```

Then edit `apps/web/.env`:

```env
# Database
DATABASE_URL="postgresql://school_admin:dev_password_change_in_prod@localhost:5432/school_sis?schema=public"

# Redis
REDIS_URL="redis://localhost:6379"

# Session Secret (generate: openssl rand -base64 32)
SESSION_SECRET="your-generated-secret-here"

# Encryption Key (generate: openssl rand -base64 32)
ENCRYPTION_KEY="your-generated-key-here"

# Next.js
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### 5. Start Database

```bash
docker-compose up -d
```

Wait 10 seconds for Postgres to initialize, then verify:

```bash
docker ps
```

### 6. Run Migrations

```bash
cd apps/web
npx prisma migrate dev --name init
```

### 7. Seed Demo Data

```bash
npx tsx prisma/seed.ts
```

Expected output:

```
✅ Created tenant: Greenwood International School
✅ Created 20 students with guardians
✅ Created 10 invoices with payments/receipts
...
```

### 8. Start Development Server

```bash
npm run dev
```

### 9. Test Login

Open browser: `http://localhost:3000`

**Demo Credentials**:

- Admin: `admin@greenwood.edu` / `admin123`
- Parent: `parent@example.com` / `parent123`

---

## Troubleshooting

### Database Connection Error

```bash
# Check Docker is running
docker ps

# Restart Postgres
docker-compose restart postgres

# View logs
docker-compose logs postgres
```

### Migration Errors

```bash
# Reset database (WARNING: deletes all data)
cd apps/web
npx prisma migrate reset
```

### Port Already in Use

```bash
# Find and kill process on port 3000
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

---

## Useful Commands

```bash
# Prisma Studio (database GUI)
cd apps/web
npx prisma studio

# Generate Prisma Client
npx prisma generate

# View database schema
npx prisma db pull

# Stop Docker services
docker-compose down
```

---

## Next: Build Features

Once login works, continue with:

1. Admin dashboard (fee overview)
2. Fee plan management UI
3. Invoice list & filters
4. Parent portal fee view

See [walkthrough.md](file:///C:/Users/AdityaSingh/.gemini/antigravity/brain/c9460e62-0469-4e5f-989d-aa9e15bc83ac/walkthrough.md) for full roadmap.
