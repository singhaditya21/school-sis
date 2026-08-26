/**
 * Shared transport constants and view types. Kept out of `actions.ts` because a
 * 'use server' module may only export async functions.
 *
 * Column widths mirror drizzle/0000_init_baseline.sql: vehicles.vehicle_number
 * is varchar(20), driver_name varchar(100), driver_phone varchar(20), and the
 * departure/pickup/drop time columns are varchar(5) — i.e. "HH:MM".
 */

export const VEHICLE_TYPES = ['Bus', 'Mini Bus', 'Van', 'Tempo Traveller', 'Car'] as const;

export const TIME_HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const PHONE_RE = /^[0-9+\-\s]+$/;

export interface VehicleView {
    id: string;
    vehicleNumber: string;
    type: string;
    capacity: number;
    driverName: string;
    driverPhone: string;
    driverLicense: string | null;
    conductorName: string | null;
    conductorPhone: string | null;
    insuranceExpiry: string | null;
    fitnessExpiry: string | null;
    gpsDeviceId: string | null;
    routeCount: number;
    /** Students on an active assignment to any route served by this vehicle. */
    assignedStudents: number;
}

export interface StopView {
    id: string;
    name: string;
    address: string | null;
    latitude: string | null;
    longitude: string | null;
    pickupTime: string | null;
    dropTime: string | null;
    displayOrder: number;
    /** Assignments (past or present) pointing at this stop — a stop with any cannot be deleted. */
    assignmentCount: number;
}

export interface RouteAssignmentView {
    id: string;
    studentId: string;
    studentName: string;
    admissionNumber: string;
    className: string | null;
    stopId: string;
    stopName: string;
    startDate: string;
    endDate: string | null;
    isActive: boolean;
}

export interface AssignableStudentView {
    id: string;
    name: string;
    admissionNumber: string;
    className: string | null;
    /** Route name this student is already actively assigned to, if any. */
    currentRouteName: string | null;
}

export interface RouteOverviewView {
    id: string;
    name: string;
    description: string | null;
    vehicleId: string;
    vehicleNumber: string;
    vehicleType: string;
    capacity: number;
    driverName: string;
    driverPhone: string;
    conductorName: string | null;
    conductorPhone: string | null;
    morningDepartureTime: string | null;
    afternoonDepartureTime: string | null;
    monthlyFee: string | null;
    stopCount: number;
    assignmentCount: number;
    activeAssignmentCount: number;
}
