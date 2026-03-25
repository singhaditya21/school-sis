// ID Card Generation Service — Production (Real DB)
import { db, setTenantContext } from '@/lib/db';
import { sql } from 'drizzle-orm';

export interface IDCardTemplate { id: string; name: string; type: 'student' | 'staff'; backgroundColor: string; textColor: string; logoPosition: 'left' | 'center' | 'right'; fields: string[]; }
export interface StudentIDCard { id: string; studentId: string; studentName: string; class: string; section: string; rollNo: string; dob: string; bloodGroup: string; address: string; parentName: string; parentPhone: string; photo: string; validFrom: string; validTo: string; qrCode: string; status: 'pending' | 'printed' | 'issued'; }
export interface StaffIDCard { id: string; staffId: string; staffName: string; designation: string; department: string; dob: string; bloodGroup: string; address: string; phone: string; email: string; joiningDate: string; photo: string; validFrom: string; validTo: string; qrCode: string; status: 'pending' | 'printed' | 'issued'; }

export const IDCardService = {
    async getTemplates(tenantId: string, type?: 'student' | 'staff'): Promise<IDCardTemplate[]> {
        await setTenantContext(tenantId);
        const rows = await db.execute(sql`SELECT id, name, type, background_color AS "backgroundColor", text_color AS "textColor", logo_position AS "logoPosition", fields FROM id_card_templates WHERE tenant_id = ${tenantId} ${type ? sql`AND type = ${type}` : sql``} ORDER BY name`);
        return rows as IDCardTemplate[];
    },

    async getStudentCards(tenantId: string, filters?: { class?: string; status?: string }): Promise<StudentIDCard[]> {
        await setTenantContext(tenantId);
        const rows = await db.execute(sql`
            SELECT ic.id, s.admission_number AS "studentId", s.first_name || ' ' || s.last_name AS "studentName",
                   g.name AS class, sec.name AS section, s.roll_number AS "rollNo", s.date_of_birth AS dob,
                   hr.blood_group AS "bloodGroup", s.address, gn.first_name || ' ' || gn.last_name AS "parentName",
                   gn.phone AS "parentPhone", s.photo, ic.valid_from AS "validFrom", ic.valid_to AS "validTo",
                   ic.qr_code AS "qrCode", ic.status
            FROM id_cards ic JOIN students s ON s.id = ic.student_id
            LEFT JOIN sections sec ON sec.id = s.section_id LEFT JOIN grades g ON g.id = sec.grade_id
            LEFT JOIN health_records hr ON hr.student_id = s.id
            LEFT JOIN guardians gn ON gn.student_id = s.id AND gn.is_primary = true
            WHERE ic.tenant_id = ${tenantId} AND ic.card_type = 'student'
            ${filters?.class ? sql`AND g.name = ${filters.class}` : sql``}
            ${filters?.status ? sql`AND ic.status = ${filters.status}` : sql``}
            ORDER BY g.display_order, s.first_name LIMIT 200`);
        return rows as StudentIDCard[];
    },

    async getStaffCards(tenantId: string, filters?: { department?: string; status?: string }): Promise<StaffIDCard[]> {
        await setTenantContext(tenantId);
        const rows = await db.execute(sql`
            SELECT ic.id, u.employee_id AS "staffId", u.first_name || ' ' || u.last_name AS "staffName",
                   u.designation, u.department, u.date_of_birth AS dob, u.blood_group AS "bloodGroup",
                   u.address, u.phone, u.email, u.joining_date AS "joiningDate", u.photo,
                   ic.valid_from AS "validFrom", ic.valid_to AS "validTo", ic.qr_code AS "qrCode", ic.status
            FROM id_cards ic JOIN users u ON u.id = ic.user_id
            WHERE ic.tenant_id = ${tenantId} AND ic.card_type = 'staff'
            ${filters?.department ? sql`AND u.department = ${filters.department}` : sql``}
            ${filters?.status ? sql`AND ic.status = ${filters.status}` : sql``}
            ORDER BY u.first_name LIMIT 200`);
        return rows as StaffIDCard[];
    },

    async getCardStats(tenantId: string) {
        await setTenantContext(tenantId);
        const [s] = await db.execute(sql`
            SELECT COUNT(*) FILTER (WHERE card_type='student') AS st, COUNT(*) FILTER (WHERE card_type='student' AND status='pending') AS sp,
            COUNT(*) FILTER (WHERE card_type='student' AND status='printed') AS spr, COUNT(*) FILTER (WHERE card_type='student' AND status='issued') AS si,
            COUNT(*) FILTER (WHERE card_type='staff') AS ft, COUNT(*) FILTER (WHERE card_type='staff' AND status='pending') AS fp,
            COUNT(*) FILTER (WHERE card_type='staff' AND status='printed') AS fpr, COUNT(*) FILTER (WHERE card_type='staff' AND status='issued') AS fi
            FROM id_cards WHERE tenant_id = ${tenantId}`) as any[];
        return { students: { total: Number(s?.st||0), pending: Number(s?.sp||0), printed: Number(s?.spr||0), issued: Number(s?.si||0) },
                 staff: { total: Number(s?.ft||0), pending: Number(s?.fp||0), printed: Number(s?.fpr||0), issued: Number(s?.fi||0) } };
    },

    generateQRData(id: string, type: 'student' | 'staff'): string { return `${id}-${new Date().getFullYear()}-${type.toUpperCase()}`; },

    async getClasses(tenantId: string): Promise<string[]> {
        await setTenantContext(tenantId);
        const rows = await db.execute(sql`SELECT name FROM grades WHERE tenant_id = ${tenantId} ORDER BY display_order`);
        return (rows as any[]).map(r => r.name);
    },

    async getDepartments(tenantId: string): Promise<string[]> {
        await setTenantContext(tenantId);
        const rows = await db.execute(sql`SELECT DISTINCT department FROM users WHERE tenant_id = ${tenantId} AND department IS NOT NULL ORDER BY department`);
        return (rows as any[]).map(r => r.department);
    },
};
