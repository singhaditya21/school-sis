import { pgTable, uuid, varchar, text, timestamp, integer, pgEnum, jsonb, date, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants, users } from './core';
import { students } from './students';

// ─── Enums ───────────────────────────────────────────────────

export const hostelTypeEnum = pgEnum('hostel_type', ['BOYS', 'GIRLS', 'CO_ED']);
export const roomTypeEnum = pgEnum('room_type', ['SINGLE', 'DOUBLE', 'TRIPLE', 'DORMITORY']);
export const roomStatusEnum = pgEnum('room_status', ['AVAILABLE', 'FULL', 'MAINTENANCE']);
export const allocationStatusEnum = pgEnum('allocation_status', ['ACTIVE', 'VACATED', 'PENDING']);

// ─── Hostels ─────────────────────────────────────────────────

export const hostels = pgTable('hostels', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    type: hostelTypeEnum('type').notNull(),
    wardenId: uuid('warden_id').references(() => users.id),
    totalRooms: integer('total_rooms').default(0).notNull(),
    totalBeds: integer('total_beds').default(0).notNull(),
    occupiedBeds: integer('occupied_beds').default(0).notNull(),
    address: text('address'),
    phone: varchar('phone', { length: 20 }),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Hostel Rooms ────────────────────────────────────────────

export const hostelRooms = pgTable('hostel_rooms', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    hostelId: uuid('hostel_id').references(() => hostels.id, { onDelete: 'cascade' }).notNull(),
    roomNumber: varchar('room_number', { length: 20 }).notNull(),
    floor: integer('floor').default(0).notNull(),
    type: roomTypeEnum('type').notNull(),
    totalBeds: integer('total_beds').notNull(),
    occupiedBeds: integer('occupied_beds').default(0).notNull(),
    amenities: jsonb('amenities').$type<string[]>().default([]),
    status: roomStatusEnum('status').default('AVAILABLE').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Hostel Allocations ──────────────────────────────────────

export const hostelAllocations = pgTable('hostel_allocations', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }).notNull(),
    hostelId: uuid('hostel_id').references(() => hostels.id, { onDelete: 'cascade' }).notNull(),
    roomId: uuid('room_id').references(() => hostelRooms.id, { onDelete: 'cascade' }).notNull(),
    bedNumber: varchar('bed_number', { length: 10 }).notNull(),
    allocatedFrom: date('allocated_from').notNull(),
    allocatedTo: date('allocated_to').notNull(),
    status: allocationStatusEnum('status').default('ACTIVE').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Mess Menus ──────────────────────────────────────────────

export const messMenus = pgTable('mess_menus', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    hostelId: uuid('hostel_id').references(() => hostels.id, { onDelete: 'cascade' }).notNull(),
    day: varchar('day', { length: 15 }).notNull(), // Monday, Tuesday, etc.
    breakfast: text('breakfast'),
    lunch: text('lunch'),
    snacks: text('snacks'),
    dinner: text('dinner'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Relations ───────────────────────────────────────────────

export const hostelsRelations = relations(hostels, ({ one, many }) => ({
    tenant: one(tenants, { fields: [hostels.tenantId], references: [tenants.id] }),
    warden: one(users, { fields: [hostels.wardenId], references: [users.id] }),
    rooms: many(hostelRooms),
    allocations: many(hostelAllocations),
    menus: many(messMenus),
}));

export const hostelRoomsRelations = relations(hostelRooms, ({ one }) => ({
    tenant: one(tenants, { fields: [hostelRooms.tenantId], references: [tenants.id] }),
    hostel: one(hostels, { fields: [hostelRooms.hostelId], references: [hostels.id] }),
}));

export const hostelAllocationsRelations = relations(hostelAllocations, ({ one }) => ({
    tenant: one(tenants, { fields: [hostelAllocations.tenantId], references: [tenants.id] }),
    student: one(students, { fields: [hostelAllocations.studentId], references: [students.id] }),
    hostel: one(hostels, { fields: [hostelAllocations.hostelId], references: [hostels.id] }),
    room: one(hostelRooms, { fields: [hostelAllocations.roomId], references: [hostelRooms.id] }),
}));

export const messMenusRelations = relations(messMenus, ({ one }) => ({
    tenant: one(tenants, { fields: [messMenus.tenantId], references: [tenants.id] }),
    hostel: one(hostels, { fields: [messMenus.hostelId], references: [hostels.id] }),
}));
