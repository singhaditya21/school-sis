// Visitor Management Service — Production (Real DB)

import { db, setTenantContext } from '@/lib/db';
import { sql } from 'drizzle-orm';

export type VisitPurpose = 'meeting' | 'admission' | 'delivery' | 'interview' | 'parent_visit' | 'vendor' | 'other';

export interface Visitor {
    id: string; name: string; phone: string; email?: string; company?: string;
    purpose: VisitPurpose; purposeDetails?: string; hostName: string; hostDepartment: string;
    photo?: string; idProof: string; idNumber: string; vehicleNumber?: string;
    checkInTime: string; checkOutTime?: string;
    status: 'checked_in' | 'checked_out' | 'pre_approved';
    visitorPass?: string; preApprovedBy?: string; preApprovedDate?: string;
}

export interface VisitorStats {
    todayTotal: number; currentlyIn: number; checkedOut: number;
    preApproved: number; averageVisitDuration: string;
}

export const VisitorService = {
    async getVisitors(tenantId: string, filters?: { status?: string; purpose?: string; date?: string }): Promise<Visitor[]> {
        await setTenantContext(tenantId);
        const rows = await db.execute(sql`
            SELECT id, name, phone, email, company, purpose, purpose_details AS "purposeDetails",
                   host_name AS "hostName", host_department AS "hostDepartment", photo,
                   id_proof AS "idProof", id_number AS "idNumber", vehicle_number AS "vehicleNumber",
                   check_in_time AS "checkInTime", check_out_time AS "checkOutTime", status,
                   visitor_pass AS "visitorPass", pre_approved_by AS "preApprovedBy",
                   pre_approved_date AS "preApprovedDate"
            FROM visitors WHERE tenant_id = ${tenantId}
            ${filters?.status ? sql`AND status = ${filters.status}` : sql``}
            ${filters?.purpose ? sql`AND purpose = ${filters.purpose}` : sql``}
            ${filters?.date ? sql`AND DATE(check_in_time) = ${filters.date}::date` : sql`AND DATE(check_in_time) = CURRENT_DATE`}
            ORDER BY check_in_time DESC LIMIT 100
        `);
        return rows as Visitor[];
    },

    async getActiveVisitors(tenantId: string): Promise<Visitor[]> {
        return this.getVisitors(tenantId, { status: 'checked_in' });
    },

    async getPreApprovedVisitors(tenantId: string): Promise<Visitor[]> {
        return this.getVisitors(tenantId, { status: 'pre_approved' });
    },

    async getStats(tenantId: string): Promise<VisitorStats> {
        await setTenantContext(tenantId);
        const [stats] = await db.execute(sql`
            SELECT COUNT(*) AS "todayTotal",
                   COUNT(*) FILTER (WHERE status = 'checked_in') AS "currentlyIn",
                   COUNT(*) FILTER (WHERE status = 'checked_out') AS "checkedOut",
                   COUNT(*) FILTER (WHERE status = 'pre_approved') AS "preApproved",
                   COALESCE(EXTRACT(HOUR FROM AVG(check_out_time - check_in_time)) || 'h ' ||
                   EXTRACT(MINUTE FROM AVG(check_out_time - check_in_time)) || 'm', '0h 0m') AS "averageVisitDuration"
            FROM visitors WHERE tenant_id = ${tenantId} AND DATE(check_in_time) = CURRENT_DATE
        `) as any[];
        return {
            todayTotal: Number(stats?.todayTotal || 0), currentlyIn: Number(stats?.currentlyIn || 0),
            checkedOut: Number(stats?.checkedOut || 0), preApproved: Number(stats?.preApproved || 0),
            averageVisitDuration: stats?.averageVisitDuration || '0h 0m',
        };
    },

    getPurposeOptions(): { value: VisitPurpose; label: string }[] {
        return [
            { value: 'meeting', label: 'Meeting' }, { value: 'admission', label: 'Admission Inquiry' },
            { value: 'delivery', label: 'Delivery' }, { value: 'interview', label: 'Interview' },
            { value: 'parent_visit', label: 'Parent Visit' }, { value: 'vendor', label: 'Vendor/Service' },
            { value: 'other', label: 'Other' },
        ];
    },

    getDepartments(): string[] {
        return ['Administration', 'Academics', 'Admissions', 'Accounts', 'HR', 'IT', 'Sports', 'Library'];
    },

    getIDProofTypes(): string[] {
        return ['Aadhaar Card', 'PAN Card', 'Driving License', 'Voter ID', 'Passport', 'Company ID', 'Other'];
    },

    generatePassNumber(): string {
        return `VP-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
    },
};
