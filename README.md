# School Information System (SIS)

**Multi-tenant, production-ready MVP for schools from Pre-School to Grade 12**

A modern school management platform with fees collections, admissions CRM, timetable management, transport tracking, and privacy-by-design features.

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 20+ and **pnpm** 9+
- **Docker** and **Docker Compose** (for Postgres + Redis)
- **Git**

### Setup Steps

1. **Clone the repository** (or use existing directory):

   ```bash
   cd d:\singhaditya21.github.io\school-sis
   ```

2. **Install dependencies**:

   ```bash
   pnpm install
   ```

3. **Configure environment variables**:

   ```bash
   cp .env.example apps/web/.env
   ```

   **Edit `apps/web/.env`** and update:
   - `DATABASE_URL` (default is fine for local Docker)
   - `SESSION_SECRET` (generate with: `openssl rand -base64 32`)
   - `ENCRYPTION_KEY` (generate with: `openssl rand -base64 32`)

4. **Start database services**:

   ```bash
   pnpm docker:up
   ```

5. **Run database migrations**:

   ```bash
   pnpm db:migrate
   ```

6. **Seed demo data**:

   ```bash
   pnpm db:seed
   ```

7. **Start development server**:

   ```bash
   pnpm dev
   ```

8. **Open browser**:
   Navigate to `http://localhost:3000`

---

## 🔑 Demo Credentials

After seeding, use these credentials to log in:

| Role | Email | Password |
|------|-------|----------|
| **School Admin** | <admin@greenwood.edu> | admin123 |
| **Accountant** | <accountant@greenwood.edu> | accountant123 |
| **Parent** | <parent@example.com> | parent123 |

**Demo Tenant**: Greenwood International School

---

## 📊 Seeded Data

- **1 School/Tenant**: Greenwood International School
- **Academic Year**: 2025-2026 with 2 terms
- **Grades**: Grade 1, Grade 2
- **Sections**: 1-A, 1-B, 2-A
- **Students**: 20 students with guardians
- **Fee Plans**: Standard fee plan with tuition, transport, library fees
- **Invoices**: 10 invoices (some pending, partial, paid)
- **Admissions**: 3 leads in different pipeline stages
- **Transport**: 1 vehicle, 1 route with 3 stops
- **Subjects**: Mathematics, English, Science

---

## 🏗️ Architecture

### Tech Stack

- **Frontend**: Next.js 15 (App Router), React 19, TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **Backend**: Next.js Server Actions
- **Database**: PostgreSQL + Prisma ORM
- **Cache/Jobs**: Redis (for future background jobs)
- **Auth**: iron-session (encrypted cookies)
- **Testing**: Jest + Playwright

### Project Structure

```
school-sis/
├── apps/
│   └── web/                    # Next.js application
│       ├── src/
│       │   ├── app/           # App Router pages
│       │   │   ├── (auth)/    # Login routes
│       │   │   ├── (admin)/   # Admin portal
│       │   │   └── (parent)/  # Parent portal
│       │   ├── components/    # React components
│       │   │   ├── ui/        # shadcn/ui components
│       │   │   ├── admin/     # Admin components
│       │   │   └── parent/    # Parent components
│       │   └── lib/
│       │       ├── actions/   # Server Actions
│       │       ├── services/  # Business logic
│       │       ├── auth/      # Authentication
│       │       ├── rbac/      # Permissions
│       │       └── db.ts      # Prisma client
│       └── prisma/
│           ├── schema.prisma  # Database schema
│           └── seed.ts        # Seed script
├── packages/                  # (Future: shared code)
├── docker-compose.yml
├── turbo.json
└── package.json
```

---

## 🔐 Multi-Tenancy & Security

### Tenant Isolation

- **Application-level scoping**: Every query includes `tenantId` filter
- **Prisma middleware**: Warns on queries without tenant scope
- **Session-based**: User's `tenantId` stored in encrypted session cookie
- **Future**: Row-Level Security (RLS) in Postgres for defense-in-depth

### Data Privacy

1. **PII Encryption**: Guardian emails & phones encrypted with AES-256-GCM
   - Encryption key in `ENCRYPTION_KEY` env variable
   - Decrypt on-demand using helper functions

2. **Audit Logging**: All financial mutations and role changes logged
   - Actor, action, entity, before/after states
   - IP address & user agent tracking

3. **Consent Vault**: Guardian consents for communication channels
   - SMS, Email, WhatsApp opt-ins
   - Opt-out enforcement in messaging system

### RBAC (Role-Based Access Control)

**Roles**:

- `SUPER_ADMIN`: Platform administrator
- `SCHOOL_ADMIN`: Full school management
- `PRINCIPAL`: Read-only + reports
- `ACCOUNTANT`: Fees & payments
- `ADMISSION_COUNSELOR`: Admissions management
- `TEACHER`: Timetable & attendance
- `TRANSPORT_MANAGER`: Transport management
- `PARENT`: View own child's data
- `STUDENT`: View own profile

**Permission System**: See `src/lib/rbac/permissions.ts`

---

## 🎯 Core Features

### Primary Wedge: Fee Collections + Dues Intelligence

- ✅ Fee plan configuration (components: tuition, transport, misc)
- ✅ Auto-invoice generation (monthly/term-wise)
- ✅ Partial payments & multiple payments per invoice
- ✅ Receipt generation
- ✅ Concessions & fine rules
- ⏳ Defaulter dashboard (in progress)
- ⏳ Cashflow forecast (in progress)
- ⏳ Reminders system (SMS/Email/WhatsApp mock providers)

### Secondary Wedges

- **Admissions CRM**: Lead capture, pipeline stages, document checklist
- **Timetable**: Periods, subject assignments, substitution engine
- **Transport**: Routes, stops, student assignments, parent ETA page
- **Consent Vault**: Communication consents, audit logs

---

## 🧪 Testing

### Run Unit Tests

```bash
pnpm test
```

### Run E2E Tests

```bash
pnpm test:e2e
```

**Test Coverage Goals**: 90%+ for service layer

**E2E Test Scenarios**:

1. Fee plan → invoice → payment → receipt
2. Reminder → message log → consent respected
3. Admission lead → application → docs → enrollment
4. Multi-tenant isolation verification

---

## 📜 Database Commands

```bash
# Generate Prisma Client
cd apps/web && pnpm prisma generate

# Create migration
pnpm db:migrate

# Seed database
pnpm db:seed

# Open Prisma Studio (GUI)
pnpm db:studio

# Reset database (WARNING: deletes all data)
cd apps/web && pnpm prisma migrate reset
```

---

## 🐳 Docker Commands

```bash
# Start services
pnpm docker:up

# Stop services
pnpm docker:down

# View logs
docker-compose logs -f postgres

# Connect to Postgres
docker exec -it school-sis-db psql -U school_admin -d school_sis
```

---

## 🛠️ Development

### Adding New Features

1. **Update Prisma schema** (`apps/web/prisma/schema.prisma`)
2. **Create migration**: `pnpm db:migrate`
3. **Add service logic** (`src/lib/services/`)
4. **Create server action** (`src/lib/actions/`)
5. **Build UI components** (`src/app/`)
6. **Write tests** (`__tests__/`)

### Adding shadcn/ui Components

```bash
cd apps/web
npx shadcn@latest add [component-name]
```

### Code Quality

```bash
# Lint
pnpm lint

# Format
pnpm format  # (if configured)
```

---

## 🗺️ Roadmap

### Phase 2 (Next 3-6 months)

- Attendance module with biometric integration
- Exam & grading system with report cards
- Library management
- Real-time communication (in-app chat, push notifications)
- Advanced analytics & predictive insights
- Native iOS/Android parent apps
- Real payment gateways (Razorpay, Stripe)
- Real SMS/WhatsApp providers (Twilio, Gupshup)

### Phase 3 (6-12 months)

- Multi-campus hierarchical structure
- Advanced RBAC with custom roles
- Compliance certifications (GDPR, COPPA readiness)
- Data residency options
- Offline-first mobile apps with sync
- Integrations: Google Classroom, Microsoft Teams
- AI-powered insights (dropout prediction, fee optimization)
- White-label capabilities

---

## 📞 Support & Contributing

### Issues

Report bugs or feature requests via GitHub issues.

### Contributing

1. Fork the repository
2. Create a feature branch
3. Commit changes with clear messages
4. Push and open a pull request

---

## 📄 License

**Proprietary** - All rights reserved

---

## 🙏 Acknowledgments

Built with modern best practices for school management, privacy-by-design, and fast ROI.

**Tech Stack Credits**:

- Next.js, React, TypeScript
- Prisma, PostgreSQL
- Tailwind CSS, shadcn/ui
- Radix UI primitives

---

**Happy School Management! 🎓**
