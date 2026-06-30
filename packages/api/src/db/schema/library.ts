import { pgTable, uuid, varchar, text, timestamp, integer, numeric, boolean, date, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants, users } from './core';
import { students } from './students';

// ─── Enums ───────────────────────────────────────────────────

export const bookCategoryEnum = pgEnum('book_category', ['TEXTBOOK', 'REFERENCE', 'FICTION', 'NON_FICTION', 'MAGAZINE', 'NEWSPAPER', 'JOURNAL']);
export const issueStatusEnum = pgEnum('issue_status', ['ISSUED', 'RETURNED', 'OVERDUE', 'LOST']);
export const reservationStatusEnum = pgEnum('reservation_status', ['ACTIVE', 'FULFILLED', 'CANCELLED', 'EXPIRED']);

// ─── Books ───────────────────────────────────────────────────

export const books = pgTable('books', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    title: varchar('title', { length: 500 }).notNull(),
    author: varchar('author', { length: 255 }).notNull(),
    isbn: varchar('isbn', { length: 20 }),
    publisher: varchar('publisher', { length: 255 }),
    edition: varchar('edition', { length: 50 }),
    year: integer('year'),
    category: bookCategoryEnum('category').default('TEXTBOOK').notNull(),
    subject: varchar('subject', { length: 100 }),
    language: varchar('language', { length: 50 }).default('English'),
    location: varchar('location', { length: 100 }), // shelf/rack
    totalCopies: integer('total_copies').default(1).notNull(),
    availableCopies: integer('available_copies').default(1).notNull(),
    price: numeric('price', { precision: 10, scale: 2 }),
    description: text('description'),
    coverUrl: text('cover_url'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Book Issues ─────────────────────────────────────────────

export const bookIssues = pgTable('book_issues', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    bookId: uuid('book_id').references(() => books.id, { onDelete: 'cascade' }).notNull(),
    issuedToUserId: uuid('issued_to_user_id').references(() => users.id).notNull(),
    issuedToStudentId: uuid('issued_to_student_id').references(() => students.id),
    issueDate: date('issue_date').notNull(),
    dueDate: date('due_date').notNull(),
    returnDate: date('return_date'),
    status: issueStatusEnum('status').default('ISSUED').notNull(),
    fineAmount: numeric('fine_amount', { precision: 10, scale: 2 }).default('0'),
    fineReason: varchar('fine_reason', { length: 255 }),
    isFinePaid: boolean('is_fine_paid').default(false).notNull(),
    issuedBy: uuid('issued_by').references(() => users.id),
    returnedTo: uuid('returned_to').references(() => users.id),
    remarks: text('remarks'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Book Reservations ───────────────────────────────────────

export const bookReservations = pgTable('book_reservations', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    bookId: uuid('book_id').references(() => books.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    reservedAt: timestamp('reserved_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    status: reservationStatusEnum('status').default('ACTIVE').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Relations ───────────────────────────────────────────────

export const booksRelations = relations(books, ({ one, many }) => ({
    tenant: one(tenants, { fields: [books.tenantId], references: [tenants.id] }),
    issues: many(bookIssues),
    reservations: many(bookReservations),
}));

export const bookIssuesRelations = relations(bookIssues, ({ one }) => ({
    tenant: one(tenants, { fields: [bookIssues.tenantId], references: [tenants.id] }),
    book: one(books, { fields: [bookIssues.bookId], references: [books.id] }),
    issuedToUser: one(users, { fields: [bookIssues.issuedToUserId], references: [users.id] }),
    issuedToStudent: one(students, { fields: [bookIssues.issuedToStudentId], references: [students.id] }),
}));

export const bookReservationsRelations = relations(bookReservations, ({ one }) => ({
    tenant: one(tenants, { fields: [bookReservations.tenantId], references: [tenants.id] }),
    book: one(books, { fields: [bookReservations.bookId], references: [books.id] }),
    user: one(users, { fields: [bookReservations.userId], references: [users.id] }),
}));
