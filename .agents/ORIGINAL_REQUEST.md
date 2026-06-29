# Original User Request

## Initial Request — 2026-06-28T06:41:22Z

# Teamwork Project Prompt — Draft

> Status: Launched
> Goal: Craft prompt → get user approval → delegate to teamwork_preview

Implement the 5 remaining Core Operations modules (Hostel, Transport, Timetable, Library, Inventory) for the School SIS web application to move them from scaffolding to full comprehensive production features.

Working directory: /Users/adityasingh/PersonalWork/school-sis/apps/web
Integrity mode: development

## Requirements

### R1. Full Comprehensive Implementation
Build all 5 modules (Hostel, Transport, Timetable, Library, Inventory) to a deep feature set. This includes advanced logic such as barcode scanning systems for the Library, GPS routing mapping for Transport, and conflict-resolution algorithms for the Timetable.

### R2. Database Migrations
For every schema file modified or created (`hostel.ts`, `transport.ts`, etc.), the agent must execute `npx drizzle-kit push` to synchronize the changes directly to the database.

### R3. UI Wiring
Replace all hardcoded mock arrays and `useState` client data with live Drizzle ORM server actions fetching directly from the database.

## Acceptance Criteria

### Technical Validation
- [ ] TypeScript compilation (`npm run build`) completes with zero errors.
- [ ] Database schema push (`npx drizzle-kit push`) completes without errors for all 5 schema files.

### Feature Validation
- [ ] The Timetable engine contains programmatic logic to prevent assigning the same teacher to two different classes simultaneously.
- [ ] The Library module contains logic designed to process barcodes or ISBN numbers.
- [ ] All 5 module dashboard URLs load without throwing 500 server errors when provided with valid tenant IDs.

## 2026-06-29T04:41:07Z

# Teamwork Project Prompt — Draft

> Status: Launched
> Goal: Craft prompt → get user approval → delegate to teamwork_preview

Implement the final 5 remaining scaffolding buckets for the School SIS web application to complete the platform's production readiness.

Working directory: /Users/adityasingh/PersonalWork/school-sis/apps/web
Integrity mode: development

## Requirements

### R1. Full Comprehensive Implementation
Build the final 5 domains out of their scaffolding states into production features:
1. **Financial & Treasury**: Implement `/treasury` ledgers and `/integrations/tally` export logic.
2. **HQ & Multi-Tenant Management**: Implement `/hq` and `/platform` global administrative controls.
3. **Advanced Analytics**: Implement `/analytics` dashboards and the central `/calendar`.
4. **Student Success**: Implement `/university` (placements), `/alumni` tracking, and `/international`.
5. **Daily Utilities**: Implement `/documents` (storage/verification) and `/diary` (daily logs).

### R2. Database Migrations
For every new schema file created, the agent must execute `npx drizzle-kit push` to synchronize the changes directly to the database.

### R3. UI Wiring
Replace all hardcoded mock arrays and `useState` client data with live Drizzle ORM server actions fetching directly from the database.

## Acceptance Criteria

### Technical Validation
- [ ] TypeScript compilation (`npm run build`) completes with zero errors.
- [ ] Database schema push (`npx drizzle-kit push`) completes without errors for all new schema files.

### Feature Validation
- [ ] The Analytics dashboard queries real data from the database.
- [ ] The Treasury module tracks ledgers that can theoretically be exported for Tally integration.
- [ ] All module dashboard URLs load without throwing 500 server errors when provided with valid tenant IDs.
- [ ] 100% of all routes in `src/app/(admin)/` are now wired to the backend.
