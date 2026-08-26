'use server';

/**
 * Transport workspace actions (colocated with the /transport route).
 *
 * Backed by the real `vehicles`, `routes`, `stops` and `student_transport`
 * tables. `stops` carries no tenant_id of its own — RLS scopes it through its
 * parent route — so every statement here joins back to `routes` and checks the
 * tenant there rather than trusting the stop id.
 */

import { revalidatePath } from 'next/cache';

import { requireAuth } from '@/lib/auth/middleware';
import { pool } from '@/lib/db';

import {
    ISO_DATE_RE,
    PHONE_RE,
    TIME_HHMM_RE,
    VEHICLE_TYPES,
    type AssignableStudentView,
    type RouteAssignmentView,
    type RouteOverviewView,
    type StopView,
    type VehicleView,
} from './transport-constants';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ActionResult {
    success: boolean;
    error?: string;
}

export interface VehicleInput {
    vehicleNumber: string;
    type?: string;
    capacity?: string;
    driverName: string;
    driverPhone: string;
    driverLicense?: string;
    conductorName?: string;
    conductorPhone?: string;
    insuranceExpiry?: string;
    fitnessExpiry?: string;
    gpsDeviceId?: string;
}

export interface RouteInput {
    name: string;
    description?: string;
    vehicleId: string;
    morningDepartureTime?: string;
    afternoonDepartureTime?: string;
    monthlyFee?: string;
}

export interface StopInput {
    name: string;
    address?: string;
    pickupTime?: string;
    dropTime?: string;
    latitude?: string;
    longitude?: string;
}

// ─── helpers ─────────────────────────────────────────────────

function trimmed(value: string | undefined | null): string | null {
    if (value === undefined || value === null) return null;
    const t = String(value).trim();
    return t === '' ? null : t;
}

function parseIntOrNull(value: string | undefined): number | null {
    const t = trimmed(value);
    if (t === null) return null;
    const n = Number.parseInt(t, 10);
    return Number.isFinite(n) ? n : null;
}

function parseMoneyOrNull(value: string | undefined): string | null {
    const t = trimmed(value);
    if (t === null) return null;
    if (!/^\d{1,10}(\.\d{1,2})?$/.test(t)) return null;
    return t;
}

/** numeric(10,7) — accepts an optionally signed decimal, otherwise null. */
function parseCoordOrNull(value: string | undefined): string | null {
    const t = trimmed(value);
    if (t === null) return null;
    if (!/^-?\d{1,3}(\.\d{1,7})?$/.test(t)) return null;
    return t;
}

function optionalTime(value: string | undefined): { ok: boolean; value: string | null } {
    const t = trimmed(value);
    if (t === null) return { ok: true, value: null };
    return TIME_HHMM_RE.test(t) ? { ok: true, value: t } : { ok: false, value: null };
}

function optionalDate(value: string | undefined): { ok: boolean; value: string | null } {
    const t = trimmed(value);
    if (t === null) return { ok: true, value: null };
    return ISO_DATE_RE.test(t) ? { ok: true, value: t } : { ok: false, value: null };
}

/** Confirms the route exists inside the caller's tenant; returns its id or null. */
async function assertRouteInTenant(routeId: string, tenantId: string): Promise<boolean> {
    if (!UUID_RE.test(routeId)) return false;
    const { rows } = await pool.query(`SELECT 1 FROM routes WHERE id = $1 AND tenant_id = $2`, [
        routeId,
        tenantId,
    ]);
    return rows.length > 0;
}

function revalidateRoute(routeId?: string) {
    revalidatePath('/transport');
    revalidatePath('/transport/vehicles');
    if (routeId) revalidatePath(`/transport/${routeId}`);
}

// ─── Vehicles ────────────────────────────────────────────────

export async function listVehicles(): Promise<VehicleView[]> {
    const { tenantId } = await requireAuth('transport:read');

    const { rows } = await pool.query(
        `SELECT v.id,
                v.vehicle_number AS "vehicleNumber",
                v.type,
                v.capacity,
                v.driver_name AS "driverName",
                v.driver_phone AS "driverPhone",
                v.driver_license AS "driverLicense",
                v.conductor_name AS "conductorName",
                v.conductor_phone AS "conductorPhone",
                v.insurance_expiry AS "insuranceExpiry",
                v.fitness_expiry AS "fitnessExpiry",
                v.gps_device_id AS "gpsDeviceId",
                (SELECT COUNT(*)::int FROM routes r
                  WHERE r.vehicle_id = v.id AND r.tenant_id = v.tenant_id) AS "routeCount",
                (SELECT COUNT(*)::int
                   FROM student_transport st
                   JOIN routes r2 ON r2.id = st.route_id
                  WHERE r2.vehicle_id = v.id
                    AND st.tenant_id = v.tenant_id
                    AND (st.end_date IS NULL OR st.end_date >= to_char(CURRENT_DATE, 'YYYY-MM-DD'))) AS "assignedStudents"
           FROM vehicles v
          WHERE v.tenant_id = $1
          ORDER BY v.vehicle_number ASC`,
        [tenantId],
    );

    return rows as VehicleView[];
}

function validateVehicle(input: VehicleInput): ActionResult {
    const vehicleNumber = trimmed(input.vehicleNumber);
    const driverName = trimmed(input.driverName);
    const driverPhone = trimmed(input.driverPhone);

    if (!vehicleNumber) return { success: false, error: 'Vehicle number is required.' };
    if (vehicleNumber.length > 20) return { success: false, error: 'Vehicle number must be 20 characters or fewer.' };
    if (!driverName) return { success: false, error: 'Driver name is required.' };
    if (driverName.length > 100) return { success: false, error: 'Driver name must be 100 characters or fewer.' };
    if (!driverPhone) return { success: false, error: 'Driver phone is required.' };
    if (!PHONE_RE.test(driverPhone)) {
        return { success: false, error: 'Driver phone may contain only digits, +, - or spaces.' };
    }
    if (driverPhone.length > 20) return { success: false, error: 'Driver phone must be 20 characters or fewer.' };

    const conductorPhone = trimmed(input.conductorPhone);
    if (conductorPhone && !PHONE_RE.test(conductorPhone)) {
        return { success: false, error: 'Conductor phone may contain only digits, +, - or spaces.' };
    }

    const type = trimmed(input.type);
    if (type && !(VEHICLE_TYPES as readonly string[]).includes(type)) {
        return { success: false, error: 'Unknown vehicle type.' };
    }

    const capacity = parseIntOrNull(input.capacity);
    if (capacity === null || capacity < 1 || capacity > 200) {
        return { success: false, error: 'Capacity must be between 1 and 200.' };
    }

    if (!optionalDate(input.insuranceExpiry).ok) {
        return { success: false, error: 'Insurance expiry must be a YYYY-MM-DD date.' };
    }
    if (!optionalDate(input.fitnessExpiry).ok) {
        return { success: false, error: 'Fitness expiry must be a YYYY-MM-DD date.' };
    }

    return { success: true };
}

export async function createVehicle(input: VehicleInput): Promise<ActionResult & { id?: string }> {
    const { tenantId } = await requireAuth('transport:write');

    const validation = validateVehicle(input);
    if (!validation.success) return validation;

    const vehicleNumber = trimmed(input.vehicleNumber) as string;

    const dupe = await pool.query(
        `SELECT 1 FROM vehicles WHERE tenant_id = $1 AND upper(vehicle_number) = upper($2)`,
        [tenantId, vehicleNumber],
    );
    if (dupe.rows.length > 0) {
        return { success: false, error: `Vehicle ${vehicleNumber} already exists.` };
    }

    const { rows } = await pool.query(
        `INSERT INTO vehicles (
             tenant_id, vehicle_number, type, capacity, driver_name, driver_phone,
             driver_license, conductor_name, conductor_phone, insurance_expiry, fitness_expiry, gps_device_id
         ) VALUES ($1, $2, COALESCE($3, 'Bus'), $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id`,
        [
            tenantId,
            vehicleNumber,
            trimmed(input.type),
            parseIntOrNull(input.capacity),
            trimmed(input.driverName),
            trimmed(input.driverPhone),
            trimmed(input.driverLicense),
            trimmed(input.conductorName),
            trimmed(input.conductorPhone),
            optionalDate(input.insuranceExpiry).value,
            optionalDate(input.fitnessExpiry).value,
            trimmed(input.gpsDeviceId),
        ],
    );

    revalidateRoute();
    return { success: true, id: rows[0].id };
}

export async function updateVehicle(vehicleId: string, input: VehicleInput): Promise<ActionResult> {
    const { tenantId } = await requireAuth('transport:write');

    if (!UUID_RE.test(vehicleId)) return { success: false, error: 'Invalid vehicle reference.' };

    const validation = validateVehicle(input);
    if (!validation.success) return validation;

    const vehicleNumber = trimmed(input.vehicleNumber) as string;

    const dupe = await pool.query(
        `SELECT 1 FROM vehicles WHERE tenant_id = $1 AND upper(vehicle_number) = upper($2) AND id <> $3`,
        [tenantId, vehicleNumber, vehicleId],
    );
    if (dupe.rows.length > 0) {
        return { success: false, error: `Vehicle ${vehicleNumber} already exists.` };
    }

    const seatedRes = await pool.query(
        `SELECT COUNT(*)::int AS count
           FROM student_transport st
           JOIN routes r ON r.id = st.route_id
          WHERE r.vehicle_id = $1
            AND st.tenant_id = $2
            AND (st.end_date IS NULL OR st.end_date >= to_char(CURRENT_DATE, 'YYYY-MM-DD'))`,
        [vehicleId, tenantId],
    );
    const seated = Number(seatedRes.rows[0]?.count ?? 0);
    const capacity = parseIntOrNull(input.capacity) as number;
    if (capacity < seated) {
        return {
            success: false,
            error: `${seated} student${seated === 1 ? ' is' : 's are'} already riding this vehicle — capacity cannot go below that.`,
        };
    }

    const { rowCount } = await pool.query(
        `UPDATE vehicles
            SET vehicle_number = $1,
                type = COALESCE($2, type),
                capacity = $3,
                driver_name = $4,
                driver_phone = $5,
                driver_license = $6,
                conductor_name = $7,
                conductor_phone = $8,
                insurance_expiry = $9,
                fitness_expiry = $10,
                gps_device_id = $11,
                updated_at = now()
          WHERE id = $12 AND tenant_id = $13`,
        [
            vehicleNumber,
            trimmed(input.type),
            capacity,
            trimmed(input.driverName),
            trimmed(input.driverPhone),
            trimmed(input.driverLicense),
            trimmed(input.conductorName),
            trimmed(input.conductorPhone),
            optionalDate(input.insuranceExpiry).value,
            optionalDate(input.fitnessExpiry).value,
            trimmed(input.gpsDeviceId),
            vehicleId,
            tenantId,
        ],
    );

    if (!rowCount) return { success: false, error: 'Vehicle not found.' };

    revalidateRoute();
    return { success: true };
}

export async function deleteVehicle(vehicleId: string): Promise<ActionResult> {
    const { tenantId } = await requireAuth('transport:write');

    if (!UUID_RE.test(vehicleId)) return { success: false, error: 'Invalid vehicle reference.' };

    const routesRes = await pool.query(
        `SELECT COUNT(*)::int AS count FROM routes WHERE vehicle_id = $1 AND tenant_id = $2`,
        [vehicleId, tenantId],
    );
    const routeCount = Number(routesRes.rows[0]?.count ?? 0);
    if (routeCount > 0) {
        return {
            success: false,
            error: `${routeCount} route${routeCount === 1 ? ' still uses' : 's still use'} this vehicle. Reassign them first.`,
        };
    }

    const { rowCount } = await pool.query(`DELETE FROM vehicles WHERE id = $1 AND tenant_id = $2`, [
        vehicleId,
        tenantId,
    ]);
    if (!rowCount) return { success: false, error: 'Vehicle not found.' };

    revalidateRoute();
    return { success: true };
}

// ─── Routes ──────────────────────────────────────────────────

export async function updateRoute(routeId: string, input: RouteInput): Promise<ActionResult> {
    const { tenantId } = await requireAuth('transport:write');

    if (!UUID_RE.test(routeId)) return { success: false, error: 'Invalid route reference.' };

    const name = trimmed(input.name);
    if (!name) return { success: false, error: 'Route name is required.' };
    if (name.length > 255) return { success: false, error: 'Route name must be 255 characters or fewer.' };

    if (!UUID_RE.test(trimmed(input.vehicleId) || '')) {
        return { success: false, error: 'Select a vehicle for this route.' };
    }

    const morning = optionalTime(input.morningDepartureTime);
    if (!morning.ok) return { success: false, error: 'Morning departure must be HH:MM.' };
    const afternoon = optionalTime(input.afternoonDepartureTime);
    if (!afternoon.ok) return { success: false, error: 'Afternoon departure must be HH:MM.' };

    if (trimmed(input.monthlyFee) !== null && parseMoneyOrNull(input.monthlyFee) === null) {
        return { success: false, error: 'Monthly fee must be a number with at most two decimal places.' };
    }

    const vehicleRes = await pool.query(`SELECT 1 FROM vehicles WHERE id = $1 AND tenant_id = $2`, [
        input.vehicleId,
        tenantId,
    ]);
    if (vehicleRes.rows.length === 0) return { success: false, error: 'Vehicle not found.' };

    const { rowCount } = await pool.query(
        `UPDATE routes
            SET name = $1,
                description = $2,
                vehicle_id = $3,
                morning_departure_time = $4,
                afternoon_departure_time = $5,
                monthly_fee = $6,
                updated_at = now()
          WHERE id = $7 AND tenant_id = $8`,
        [
            name,
            trimmed(input.description),
            input.vehicleId,
            morning.value,
            afternoon.value,
            parseMoneyOrNull(input.monthlyFee),
            routeId,
            tenantId,
        ],
    );

    if (!rowCount) return { success: false, error: 'Route not found.' };

    revalidateRoute(routeId);
    return { success: true };
}

/**
 * Routes are hard-deleted (stops cascade), but only once nothing references
 * them: `student_transport.route_id` has no ON DELETE rule, so an assignment
 * would make the delete fail at the database anyway.
 */
export async function deleteRoute(routeId: string): Promise<ActionResult> {
    const { tenantId } = await requireAuth('transport:write');

    if (!UUID_RE.test(routeId)) return { success: false, error: 'Invalid route reference.' };

    const assignedRes = await pool.query(
        `SELECT COUNT(*)::int AS count FROM student_transport WHERE route_id = $1 AND tenant_id = $2`,
        [routeId, tenantId],
    );
    const assigned = Number(assignedRes.rows[0]?.count ?? 0);
    if (assigned > 0) {
        return {
            success: false,
            error: `${assigned} student assignment${assigned === 1 ? ' references' : 's reference'} this route. Remove them first.`,
        };
    }

    const { rowCount } = await pool.query(`DELETE FROM routes WHERE id = $1 AND tenant_id = $2`, [
        routeId,
        tenantId,
    ]);
    if (!rowCount) return { success: false, error: 'Route not found.' };

    revalidatePath('/transport');
    revalidatePath('/transport/vehicles');
    return { success: true };
}

// ─── Stops ───────────────────────────────────────────────────

export async function listStops(routeId: string): Promise<StopView[]> {
    const { tenantId } = await requireAuth('transport:read');

    if (!(await assertRouteInTenant(routeId, tenantId))) return [];

    const { rows } = await pool.query(
        `SELECT s.id,
                s.name,
                s.address,
                s.latitude,
                s.longitude,
                s.pickup_time AS "pickupTime",
                s.drop_time AS "dropTime",
                s.display_order AS "displayOrder",
                (SELECT COUNT(*)::int FROM student_transport st
                  WHERE st.stop_id = s.id AND st.tenant_id = $2) AS "assignmentCount"
           FROM stops s
           JOIN routes r ON r.id = s.route_id
          WHERE s.route_id = $1 AND r.tenant_id = $2
          ORDER BY s.display_order ASC, s.name ASC`,
        [routeId, tenantId],
    );

    return rows as StopView[];
}

function validateStop(input: StopInput): ActionResult {
    const name = trimmed(input.name);
    if (!name) return { success: false, error: 'Stop name is required.' };
    if (name.length > 255) return { success: false, error: 'Stop name must be 255 characters or fewer.' };

    if (!optionalTime(input.pickupTime).ok) return { success: false, error: 'Pickup time must be HH:MM.' };
    if (!optionalTime(input.dropTime).ok) return { success: false, error: 'Drop time must be HH:MM.' };

    if (trimmed(input.latitude) !== null && parseCoordOrNull(input.latitude) === null) {
        return { success: false, error: 'Latitude must be a decimal number.' };
    }
    if (trimmed(input.longitude) !== null && parseCoordOrNull(input.longitude) === null) {
        return { success: false, error: 'Longitude must be a decimal number.' };
    }

    return { success: true };
}

export async function createStop(routeId: string, input: StopInput): Promise<ActionResult & { id?: string }> {
    const { tenantId } = await requireAuth('transport:write');

    if (!(await assertRouteInTenant(routeId, tenantId))) {
        return { success: false, error: 'Route not found.' };
    }

    const validation = validateStop(input);
    if (!validation.success) return validation;

    const orderRes = await pool.query(
        `SELECT COALESCE(MAX(display_order), 0) + 1 AS next FROM stops WHERE route_id = $1`,
        [routeId],
    );

    const { rows } = await pool.query(
        `INSERT INTO stops (route_id, name, address, latitude, longitude, pickup_time, drop_time, display_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
            routeId,
            trimmed(input.name),
            trimmed(input.address),
            parseCoordOrNull(input.latitude),
            parseCoordOrNull(input.longitude),
            optionalTime(input.pickupTime).value,
            optionalTime(input.dropTime).value,
            Number(orderRes.rows[0].next),
        ],
    );

    revalidateRoute(routeId);
    return { success: true, id: rows[0].id };
}

export async function updateStop(stopId: string, input: StopInput): Promise<ActionResult> {
    const { tenantId } = await requireAuth('transport:write');

    if (!UUID_RE.test(stopId)) return { success: false, error: 'Invalid stop reference.' };

    const validation = validateStop(input);
    if (!validation.success) return validation;

    // stops has no tenant_id — scope through the owning route.
    const { rows } = await pool.query(
        `SELECT s.route_id AS "routeId"
           FROM stops s
           JOIN routes r ON r.id = s.route_id
          WHERE s.id = $1 AND r.tenant_id = $2`,
        [stopId, tenantId],
    );
    if (rows.length === 0) return { success: false, error: 'Stop not found.' };

    await pool.query(
        `UPDATE stops
            SET name = $1, address = $2, latitude = $3, longitude = $4, pickup_time = $5, drop_time = $6
          WHERE id = $7`,
        [
            trimmed(input.name),
            trimmed(input.address),
            parseCoordOrNull(input.latitude),
            parseCoordOrNull(input.longitude),
            optionalTime(input.pickupTime).value,
            optionalTime(input.dropTime).value,
            stopId,
        ],
    );

    revalidateRoute(rows[0].routeId);
    return { success: true };
}

export async function deleteStop(stopId: string): Promise<ActionResult> {
    const { tenantId } = await requireAuth('transport:write');

    if (!UUID_RE.test(stopId)) return { success: false, error: 'Invalid stop reference.' };

    const { rows } = await pool.query(
        `SELECT s.route_id AS "routeId",
                (SELECT COUNT(*)::int FROM student_transport st WHERE st.stop_id = s.id) AS "assignmentCount"
           FROM stops s
           JOIN routes r ON r.id = s.route_id
          WHERE s.id = $1 AND r.tenant_id = $2`,
        [stopId, tenantId],
    );
    if (rows.length === 0) return { success: false, error: 'Stop not found.' };

    const assignmentCount = Number(rows[0].assignmentCount ?? 0);
    if (assignmentCount > 0) {
        return {
            success: false,
            error: `${assignmentCount} student assignment${assignmentCount === 1 ? ' uses' : 's use'} this stop. Move them first.`,
        };
    }

    await pool.query(`DELETE FROM stops WHERE id = $1`, [stopId]);

    revalidateRoute(rows[0].routeId);
    return { success: true };
}

/** Swap a stop with its neighbour so staff can put the run in road order. */
export async function moveStop(stopId: string, direction: 'up' | 'down'): Promise<ActionResult> {
    const { tenantId } = await requireAuth('transport:write');

    if (!UUID_RE.test(stopId)) return { success: false, error: 'Invalid stop reference.' };
    if (direction !== 'up' && direction !== 'down') {
        return { success: false, error: 'Invalid direction.' };
    }

    const { rows } = await pool.query(
        `SELECT s.id, s.route_id AS "routeId", s.display_order AS "displayOrder"
           FROM stops s
           JOIN routes r ON r.id = s.route_id
          WHERE s.id = $1 AND r.tenant_id = $2`,
        [stopId, tenantId],
    );
    if (rows.length === 0) return { success: false, error: 'Stop not found.' };

    const { routeId, displayOrder } = rows[0];

    const neighbourRes = await pool.query(
        direction === 'up'
            ? `SELECT id, display_order AS "displayOrder" FROM stops
                WHERE route_id = $1 AND display_order < $2
                ORDER BY display_order DESC LIMIT 1`
            : `SELECT id, display_order AS "displayOrder" FROM stops
                WHERE route_id = $1 AND display_order > $2
                ORDER BY display_order ASC LIMIT 1`,
        [routeId, displayOrder],
    );
    const neighbour = neighbourRes.rows[0];
    if (!neighbour) return { success: false, error: 'Already at the end of the route.' };

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // display_order has no unique constraint, so a straight swap is safe.
        await client.query(`UPDATE stops SET display_order = $1 WHERE id = $2`, [
            neighbour.displayOrder,
            stopId,
        ]);
        await client.query(`UPDATE stops SET display_order = $1 WHERE id = $2`, [
            displayOrder,
            neighbour.id,
        ]);
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }

    revalidateRoute(routeId);
    return { success: true };
}

// ─── Student assignments ─────────────────────────────────────

export async function listRouteAssignments(routeId: string): Promise<RouteAssignmentView[]> {
    const { tenantId } = await requireAuth('transport:read');

    if (!(await assertRouteInTenant(routeId, tenantId))) return [];

    const { rows } = await pool.query(
        `SELECT st.id,
                st.student_id AS "studentId",
                s.first_name || ' ' || s.last_name AS "studentName",
                s.admission_number AS "admissionNumber",
                g.name || '-' || sec.name AS "className",
                st.stop_id AS "stopId",
                stop.name AS "stopName",
                st.start_date AS "startDate",
                st.end_date AS "endDate",
                (st.end_date IS NULL OR st.end_date >= to_char(CURRENT_DATE, 'YYYY-MM-DD')) AS "isActive"
           FROM student_transport st
           JOIN students s ON s.id = st.student_id
           JOIN stops stop ON stop.id = st.stop_id
           LEFT JOIN sections sec ON sec.id = s.section_id
           LEFT JOIN grades g ON g.id = sec.grade_id
          WHERE st.route_id = $1 AND st.tenant_id = $2
          ORDER BY "isActive" DESC, s.first_name ASC`,
        [routeId, tenantId],
    );

    return rows as RouteAssignmentView[];
}

/** Active students, annotated with the route they already ride (if any). */
export async function listAssignableStudents(): Promise<AssignableStudentView[]> {
    const { tenantId } = await requireAuth('transport:read');

    const { rows } = await pool.query(
        `SELECT s.id,
                s.first_name || ' ' || s.last_name AS name,
                s.admission_number AS "admissionNumber",
                g.name || '-' || sec.name AS "className",
                (SELECT r.name
                   FROM student_transport st
                   JOIN routes r ON r.id = st.route_id
                  WHERE st.student_id = s.id
                    AND st.tenant_id = s.tenant_id
                    AND (st.end_date IS NULL OR st.end_date >= to_char(CURRENT_DATE, 'YYYY-MM-DD'))
                  ORDER BY st.start_date DESC
                  LIMIT 1) AS "currentRouteName"
           FROM students s
           LEFT JOIN sections sec ON sec.id = s.section_id
           LEFT JOIN grades g ON g.id = sec.grade_id
          WHERE s.tenant_id = $1 AND s.status = 'ACTIVE'
          ORDER BY s.first_name ASC, s.last_name ASC
          LIMIT 500`,
        [tenantId],
    );

    return rows as AssignableStudentView[];
}

/** Close an assignment as of a date; the row stays for the fee/audit trail. */
export async function endAssignment(assignmentId: string, endDate: string): Promise<ActionResult> {
    const { tenantId } = await requireAuth('transport:write');

    if (!UUID_RE.test(assignmentId)) return { success: false, error: 'Invalid assignment reference.' };

    const date = optionalDate(endDate);
    if (!date.ok || date.value === null) {
        return { success: false, error: 'End date must be a YYYY-MM-DD date.' };
    }

    const { rows } = await pool.query(
        `SELECT route_id AS "routeId", start_date AS "startDate"
           FROM student_transport WHERE id = $1 AND tenant_id = $2`,
        [assignmentId, tenantId],
    );
    if (rows.length === 0) return { success: false, error: 'Assignment not found.' };

    if (date.value < rows[0].startDate) {
        return { success: false, error: 'End date cannot be before the start date.' };
    }

    await pool.query(`UPDATE student_transport SET end_date = $1 WHERE id = $2 AND tenant_id = $3`, [
        date.value,
        assignmentId,
        tenantId,
    ]);

    revalidateRoute(rows[0].routeId);
    return { success: true };
}

/** Delete an assignment outright — for a mistake, not for a student leaving. */
export async function removeAssignment(assignmentId: string): Promise<ActionResult> {
    const { tenantId } = await requireAuth('transport:write');

    if (!UUID_RE.test(assignmentId)) return { success: false, error: 'Invalid assignment reference.' };

    const { rows } = await pool.query(
        `SELECT route_id AS "routeId" FROM student_transport WHERE id = $1 AND tenant_id = $2`,
        [assignmentId, tenantId],
    );
    if (rows.length === 0) return { success: false, error: 'Assignment not found.' };

    await pool.query(`DELETE FROM student_transport WHERE id = $1 AND tenant_id = $2`, [
        assignmentId,
        tenantId,
    ]);

    revalidateRoute(rows[0].routeId);
    return { success: true };
}

// ─── Route overview ──────────────────────────────────────────

/**
 * Everything the route detail screen needs in one round trip, including the
 * vehicle id the edit dialog binds to (which the older getRouteDetail() in
 * lib/actions/transport.ts does not return).
 */
export async function getRouteOverview(routeId: string): Promise<RouteOverviewView | null> {
    const { tenantId } = await requireAuth('transport:read');

    if (!UUID_RE.test(routeId)) return null;

    const { rows } = await pool.query(
        `SELECT r.id,
                r.name,
                r.description,
                r.vehicle_id AS "vehicleId",
                v.vehicle_number AS "vehicleNumber",
                v.type AS "vehicleType",
                v.capacity,
                v.driver_name AS "driverName",
                v.driver_phone AS "driverPhone",
                v.conductor_name AS "conductorName",
                v.conductor_phone AS "conductorPhone",
                r.morning_departure_time AS "morningDepartureTime",
                r.afternoon_departure_time AS "afternoonDepartureTime",
                r.monthly_fee AS "monthlyFee",
                (SELECT COUNT(*)::int FROM stops s WHERE s.route_id = r.id) AS "stopCount",
                (SELECT COUNT(*)::int FROM student_transport st
                  WHERE st.route_id = r.id AND st.tenant_id = r.tenant_id) AS "assignmentCount",
                (SELECT COUNT(*)::int FROM student_transport st
                  WHERE st.route_id = r.id AND st.tenant_id = r.tenant_id
                    AND (st.end_date IS NULL OR st.end_date >= to_char(CURRENT_DATE, 'YYYY-MM-DD'))) AS "activeAssignmentCount"
           FROM routes r
           JOIN vehicles v ON v.id = r.vehicle_id
          WHERE r.id = $1 AND r.tenant_id = $2`,
        [routeId, tenantId],
    );

    return (rows[0] as RouteOverviewView) || null;
}
