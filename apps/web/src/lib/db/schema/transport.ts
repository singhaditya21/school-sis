import { pgTable, uuid, varchar, text, timestamp, integer, numeric } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants } from './core';
import { students } from './students';

// ─── Vehicles ────────────────────────────────────────────────

export const vehicles = pgTable('vehicles', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    vehicleNumber: varchar('vehicle_number', { length: 20 }).notNull(),
    type: varchar('type', { length: 50 }).notNull(), // Bus, Van, Auto
    capacity: integer('capacity').notNull(),
    driverName: varchar('driver_name', { length: 100 }).notNull(),
    driverPhone: varchar('driver_phone', { length: 20 }).notNull(),
    driverLicense: varchar('driver_license', { length: 50 }),
    conductorName: varchar('conductor_name', { length: 100 }),
    conductorPhone: varchar('conductor_phone', { length: 20 }),
    insuranceExpiry: varchar('insurance_expiry', { length: 10 }),
    fitnessExpiry: varchar('fitness_expiry', { length: 10 }),
    gpsDeviceId: varchar('gps_device_id', { length: 100 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Routes ──────────────────────────────────────────────────

export const routes = pgTable('routes', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    vehicleId: uuid('vehicle_id').references(() => vehicles.id).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    morningDepartureTime: varchar('morning_departure_time', { length: 5 }), // "07:00"
    afternoonDepartureTime: varchar('afternoon_departure_time', { length: 5 }),
    monthlyFee: numeric('monthly_fee', { precision: 12, scale: 2 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Stops ───────────────────────────────────────────────────

export const stops = pgTable('stops', {
    id: uuid('id').primaryKey().defaultRandom(),
    routeId: uuid('route_id').references(() => routes.id, { onDelete: 'cascade' }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    address: text('address'),
    latitude: numeric('latitude', { precision: 10, scale: 7 }),
    longitude: numeric('longitude', { precision: 10, scale: 7 }),
    pickupTime: varchar('pickup_time', { length: 5 }),
    dropTime: varchar('drop_time', { length: 5 }),
    displayOrder: integer('display_order').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Student Transport Assignment ────────────────────────────

export const studentTransport = pgTable('student_transport', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }).notNull(),
    routeId: uuid('route_id').references(() => routes.id).notNull(),
    stopId: uuid('stop_id').references(() => stops.id).notNull(),
    startDate: varchar('start_date', { length: 10 }).notNull(),
    endDate: varchar('end_date', { length: 10 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Relations ───────────────────────────────────────────────

export const vehiclesRelations = relations(vehicles, ({ one, many }) => ({
    tenant: one(tenants, { fields: [vehicles.tenantId], references: [tenants.id] }),
    routes: many(routes),
}));

export const routesRelations = relations(routes, ({ one, many }) => ({
    tenant: one(tenants, { fields: [routes.tenantId], references: [tenants.id] }),
    vehicle: one(vehicles, { fields: [routes.vehicleId], references: [vehicles.id] }),
    stops: many(stops),
    studentTransport: many(studentTransport),
}));

export const stopsRelations = relations(stops, ({ one }) => ({
    route: one(routes, { fields: [stops.routeId], references: [routes.id] }),
}));

export const studentTransportRelations = relations(studentTransport, ({ one }) => ({
    tenant: one(tenants, { fields: [studentTransport.tenantId], references: [tenants.id] }),
    student: one(students, { fields: [studentTransport.studentId], references: [students.id] }),
    route: one(routes, { fields: [studentTransport.routeId], references: [routes.id] }),
    stop: one(stops, { fields: [studentTransport.stopId], references: [stops.id] }),
}));
