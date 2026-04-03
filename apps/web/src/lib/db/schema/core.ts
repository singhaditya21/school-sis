import { pgTable, uuid, varchar, text, timestamp, boolean, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ─── Enums ───────────────────────────────────────────────────

export const userRoleEnum = pgEnum('user_role', [
    'SUPER_ADMIN',
    'SCHOOL_ADMIN',
    'PRINCIPAL',
    'ACCOUNTANT',
    'ADMISSION_COUNSELOR',
    'TEACHER',
    'TRANSPORT_MANAGER',
    'PARENT',
    'STUDENT',
]);

export const subscriptionTierEnum = pgEnum('subscription_tier', ['CORE', 'AI_PRO', 'ENTERPRISE']);

// ─── Companies (Master Billing & Features) ───────────────────

export const companies = pgTable('companies', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
    stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }),
    stripePriceId: varchar('stripe_price_id', { length: 255 }),
    stripeCurrentPeriodEnd: timestamp('stripe_current_period_end', { withTimezone: true }),
    billingStatus: varchar('billing_status', { length: 50 }).default('TRIALING').notNull(),
    subscriptionTier: subscriptionTierEnum('subscription_tier').default('CORE').notNull(),
    activeModules: text('active_modules').array().default(['ATTENDANCE', 'FEES', 'COMMUNICATION']), // PostgreSQL text array
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Tenants (Schools / Nodes) ──────────────────────────────

export const tenants = pgTable('tenants', {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }), // Nullable initially for migration
    name: varchar('name', { length: 255 }).notNull(),
    code: varchar('code', { length: 50 }).notNull().unique(),
    domain: varchar('domain', { length: 255 }),
    logoUrl: text('logo_url'),
    address: text('address'),
    city: varchar('city', { length: 100 }),
    state: varchar('state', { length: 100 }),
    pincode: varchar('pincode', { length: 10 }),
    phone: varchar('phone', { length: 20 }),
    email: varchar('email', { length: 255 }),
    website: varchar('website', { length: 255 }),
    affiliationBoard: varchar('affiliation_board', { length: 50 }),
    affiliationNumber: varchar('affiliation_number', { length: 100 }),
    udiseCode: varchar('udise_code', { length: 20 }),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Users ───────────────────────────────────────────────────

export const users = pgTable('users', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    role: userRoleEnum('role').notNull(),
    phone: varchar('phone', { length: 20 }),
    avatarUrl: text('avatar_url'),
    isActive: boolean('is_active').default(true).notNull(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Relations ───────────────────────────────────────────────

export const companiesRelations = relations(companies, ({ many }) => ({
    tenants: many(tenants),
}));

export const tenantsRelations = relations(tenants, ({ one, many }) => ({
    company: one(companies, {
        fields: [tenants.companyId],
        references: [companies.id],
    }),
    users: many(users),
}));

export const usersRelations = relations(users, ({ one }) => ({
    tenant: one(tenants, {
        fields: [users.tenantId],
        references: [tenants.id],
    }),
}));
