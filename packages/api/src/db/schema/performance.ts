import { pgTable, text, integer, timestamp, index } from 'drizzle-orm/pg-core';

export const rateLimitBuckets = pgTable('rate_limit_buckets', {
    key: text('key').primaryKey(),
    count: integer('count').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    expiresAtIdx: index('idx_rate_limit_buckets_expires').on(table.expiresAt),
}));
