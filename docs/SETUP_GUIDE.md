# 🚀 Complete Setup & Run Guide

## Step-by-Step Instructions to Run the School SIS Application

### ⚡ Quick Start (For the Impatient)

```bash
# 1. Navigate to project
cd d:\singhaditya21.github.io\school-sis

# 2. Install dependencies
npm install
cd apps/web
npm install
cd ../..

# 3. Copy environment file
cp .env.example apps/web/.env

# 4. Start Docker services
docker-compose up -d

# 5. Run migrations & seed
pnpm db:generate
pnpm db:migrate
pnpm db:seed

# 6. Start the app
npm run dev

# 7. Open browser
# Visit: http://localhost:3000
```

---

## 📋 Detailed Step-by-Step Guide

### Step 1: Check Prerequisites

Before starting, ensure you have:

**Required**:

- ✅ **Node.js 20+** - Check: `node --version`
  - If not installed: Download from <https://nodejs.org>
- ✅ **Docker Desktop** - Check: `docker --version`
  - If not installed: Download from <https://www.docker.com/products/docker-desktop>
- ✅ **Git** (for OpenSSL commands)

**Start Docker Desktop**:

- Open Docker Desktop application
- Wait until it shows "Running" status
- Verify: `docker ps` should work without errors

---

### Step 2: Navigate to Project Directory

```powershell
cd d:\singhaditya21.github.io\school-sis
```

**Verify you're in the right place**:

```powershell
dir
```

You should see: `package.json`, `docker-compose.yml`, `turbo.json`, etc.

---

### Step 3: Install Dependencies

**Root dependencies** (for Turborepo):

```powershell
npm install
```

**Web app dependencies**:

```powershell
cd apps\web
npm install
cd ..\..
```

This will install:

- Next.js, React, TypeScript
- Prisma, bcryptjs, iron-session, zod
- Tailwind CSS, shadcn/ui components
- All other dependencies (~50+ packages)

**Expected time**: 2-5 minutes depending on internet speed

---

### Step 4: Setup Environment Variables

**Copy the template**:

```powershell
copy .env.example apps\web\.env
```

**Edit `apps/web/.env`**:

Open the file in any text editor and update these values:

```env
# Database (leave as-is for local Docker)
DATABASE_URL="postgresql://school_admin:dev_password_change_in_prod@localhost:5432/school_sis?schema=public"

# Redis (leave as-is for local Docker)
REDIS_URL="redis://localhost:6379"

# Session Secret (GENERATE THIS!)
SESSION_SECRET="your-generated-secret-here"

# Encryption Key (GENERATE THIS!)
ENCRYPTION_KEY="your-generated-key-here"

# Next.js App URL
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

**Generate Secrets** (use Git Bash or WSL):

```bash
# For SESSION_SECRET
openssl rand -base64 32

# For ENCRYPTION_KEY
openssl rand -base64 32
```

**Alternative (if no OpenSSL)** - Use any random 32+ character string:

```
SESSION_SECRET="my-super-secret-session-key-12345678"
ENCRYPTION_KEY="my-encryption-key-for-pii-data-xyz"
```

---

### Step 5: Start Database Services

**Start PostgreSQL and Redis**:

```powershell
docker-compose up -d
```

**Expected output**:

```
[+] Running 2/2
 ✔ Container school-sis-db    Started
 ✔ Container school-sis-redis Started
```

**Verify services are running**:

```powershell
docker ps
```

You should see two containers running:

- `school-sis-db` (Postgres)
- `school-sis-redis` (Redis)

**Wait 10 seconds** for Postgres to fully initialize (first-time setup)

---

### Step 6: Setup Database

Navigate to web app:

```powershell
cd apps\web
```

**Generate Prisma Client**:

```powershell
pnpm db:generate
```

**Run Database Migrations**:

```powershell
pnpm db:migrate
```

This will:

1. Create all 30+ tables in Postgres
2. Set up indexes and relationships
3. Apply constraints

**Expected output**:

```
✔ Generated Prisma Client
✔ Database synchronized with Prisma schema
```

---

### Step 7: Seed Demo Data

**Run the seed script**:

```powershell
pnpm db:seed
```

**Expected output** (takes ~5-10 seconds):

```
✅ Created tenant: Greenwood International School
✅ Created academic year: 2025-2026
✅ Created 3 grades and 3 sections
✅ Created 20 students with guardians
✅ Created 3 users (admin, accountant, parent)
✅ Created fee plan with components
✅ Created 10 invoices
✅ Created payments and receipts
✅ Created 3 admission leads
✅ Created subjects and transport data
🎉 Seed completed successfully!
```

---

### Step 8: Start the Development Server

**From `apps/web` directory**:

```powershell
npm run dev
```

**Expected output**:

```
   ▲ Next.js 15.x.x
   - Local:        http://localhost:3000
   - Ready in 3.2s
```

**Keep this terminal open** - this is your dev server.

---

### Step 9: Access the Application

**Open your browser** and go to:

```
http://localhost:3000
```

You'll be redirected to the login page.

---

## 🔐 Login & Test

### Test Credentials

**1. School Admin** (Full Access):

- Email: `admin@greenwood.edu`
- Password: `admin123`
- Access: Dashboard, Fees, Students, Admissions, Timetable, Transport, Settings

**2. Accountant** (Fee Management):

- Email: `accountant@greenwood.edu`
- Password: `accountant123`
- Access: Dashboard, Fees, Invoices, Payments

**3. Parent** (Mobile Portal):

- Email: `parent@example.com`
- Password: `parent123`
- Access: Children overview, Fees, Payment history

---

## ✅ Verification Checklist

After logging in as admin, verify:

- [ ] Dashboard shows statistics (students, collections)
- [ ] Navigate to **Fees → Defaulters** - See overdue buckets
- [ ] Navigate to **Invoices** - See list of 10 invoices
- [ ] Navigate to **Admissions** - See 3 leads on pipeline board
- [ ] Navigate to **Students** - See list of 20 students
- [ ] Navigate to **Timetable** - See subjects list
- [ ] Navigate to **Transport** - See route details

**Parent Portal Test**:

- Logout from admin
- Login as parent (`parent@example.com` / `parent123`)
- See child card with fee summary
- Click "View All Fees & Pay"
- See invoice details

---

## 🛠️ Useful Commands

### Database Management

**View database in GUI** (Prisma Studio):

```powershell
pnpm db:studio
```

Opens at `http://localhost:5555`

**Reset database** (⚠️ Deletes all data):

```powershell
# Drop and recreate your local database, then run:
pnpm db:migrate
```

**Re-seed after reset**:

```powershell
pnpm db:seed
```

### Docker Commands

**View logs**:

```powershell
docker-compose logs -f postgres
docker-compose logs -f redis
```

**Stop services**:

```powershell
docker-compose down
```

**Restart services**:

```powershell
docker-compose restart
```

**Connect to Postgres manually**:

```powershell
docker exec -it school-sis-db psql -U school_admin -d school_sis
```

### Development

**Build for production**:

```powershell
cd apps\web
npm run build
```

**Start production server**:

```powershell
npm start
```

**Lint code**:

```powershell
npm run lint
```

---

## 🐛 Troubleshooting

### Problem: "Port 3000 already in use"

**Solution**: Kill the process or use a different port

```powershell
# Find process on port 3000
netstat -ano | findstr :3000

# Kill it (replace PID with actual number)
taskkill /PID <PID> /F

# Or run on different port
$env:PORT=3001; npm run dev
```

### Problem: "Docker daemon not running"

**Solution**: Start Docker Desktop

- Open Docker Desktop app
- Wait for it to fully start
- Green indicator means ready
- Try `docker ps` again

### Problem: Database connection error

**Solution**: Check Docker container

```powershell
# Check if container is running
docker ps

# If not running, start it
docker-compose up -d

# Check logs
docker-compose logs postgres

# Wait 10 seconds, then retry
```

### Problem: "Module not found" errors

**Solution**: Reinstall dependencies

```powershell
# Clean install
cd apps\web
rm -r node_modules
rm package-lock.json
npm install
```

### Problem: Prisma client errors

**Solution**: Regenerate client

```powershell
pnpm db:generate
```

### Problem: Migration fails

**Solution**: Reset and re-migrate

```powershell
# Drop and recreate your local database, then run:
pnpm db:migrate
pnpm db:seed
```

### Problem: Login not working

**Solutions**:

1. Check if SESSION_SECRET is set in `.env`
2. Verify seed script ran successfully
3. Check browser console for errors
4. Try different browser (clear cache)

---

## 📱 Testing Parent Portal (Mobile)

**Best viewed on**:

1. Chrome DevTools mobile emulation
   - F12 → Toggle device toolbar
   - Select iPhone or any mobile device
2. Actual mobile device
   - Get your local IP: `ipconfig`
   - Access from phone: `http://YOUR_IP:3000`
   - Requires both devices on same network

---

## 🔄 Daily Development Workflow

**Starting work**:

```powershell
# 1. Start Docker
docker-compose up -d

# 2. Start dev server
cd apps\web
npm run dev
```

**Ending work**:

```powershell
# 1. Stop dev server (Ctrl+C)

# 2. (Optional) Stop Docker to free resources
docker-compose down
```

**Making database changes**:

```powershell
# 1. Edit packages/api/src/db/schema/

# 2. Create migration
pnpm db:generate

# 3. Review and apply the generated Drizzle SQL
pnpm db:migrate
```

---

## 🚀 Next Steps After Setup

Once the app is running:

1. **Explore Admin Features**:
   - Generate invoices for a class
   - Record a payment
   - View defaulter analytics
   - Check cashflow forecast

2. **Test Parent Portal**:
   - View fees for child
   - Initiate payment (mock gateway)
   - Download receipt

3. **Check Admissions**:
   - View pipeline board
   - Click on leads

4. **Review Code**:
   - Start with `src/app` for pages
   - Check `src/lib/services` for business logic
   - Review `packages/api/src/db/schema/` for the data model

5. **Customize**:
   - Update school name in seed data
   - Add your own fee components
   - Modify color scheme in `globals.css`

---

## 📞 Quick Reference

| Action | Command |
|--------|---------|
| Start app | `cd apps/web && npm run dev` |
| Start Docker | `docker-compose up -d` |
| Stop Docker | `docker-compose down` |
| Seed data | `pnpm db:seed` |
| Database GUI | `pnpm db:studio` |
| View logs | `docker-compose logs -f postgres` |
| Reset DB | Drop/recreate local DB, then `pnpm db:migrate` |

**Default URLs**:

- App: <http://localhost:3000>
- Prisma Studio: <http://localhost:5555>

**Demo Login**: `admin@greenwood.edu` / `admin123`

---

**🎉 You're all set! Happy coding!**
