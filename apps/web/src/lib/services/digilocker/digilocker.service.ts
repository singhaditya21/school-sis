// DigiLocker Integration Service — Production (Real DB)
import { db, setTenantContext } from '@/lib/db';
import { sql } from 'drizzle-orm';

export interface DigiLockerCertificate { id: string; studentId: string; studentName: string; type: string; issueDate: string; issuedBy: string; documentNumber: string; status: 'issued'|'verified'|'revoked'; verificationUrl?: string; }

export const DigiLockerService = {
    async getCertificates(tenantId: string, filters?: { type?: string; studentId?: string }): Promise<DigiLockerCertificate[]> {
        await setTenantContext(tenantId);
        const rows = await db.execute(sql`SELECT c.id,c.student_id AS "studentId",s.first_name||' '||s.last_name AS "studentName",c.type,c.issue_date AS "issueDate",u.first_name||' '||u.last_name AS "issuedBy",c.document_number AS "documentNumber",c.status,c.verification_url AS "verificationUrl" FROM certificates c JOIN students s ON s.id=c.student_id LEFT JOIN users u ON u.id=c.issued_by WHERE c.tenant_id=${tenantId} ${filters?.type?sql`AND c.type=${filters.type}`:sql``} ${filters?.studentId?sql`AND c.student_id=${filters.studentId}`:sql``} ORDER BY c.issue_date DESC LIMIT 100`);
        return rows as DigiLockerCertificate[];
    },
    async getStats(tenantId: string) {
        await setTenantContext(tenantId);
        const [s] = await db.execute(sql`SELECT COUNT(*) AS total,COUNT(*) FILTER(WHERE status='issued') AS issued,COUNT(*) FILTER(WHERE status='verified') AS verified,COUNT(DISTINCT type) AS "certificateTypes" FROM certificates WHERE tenant_id=${tenantId}`) as any[];
        return { total: Number(s?.total||0), issued: Number(s?.issued||0), verified: Number(s?.verified||0), certificateTypes: Number(s?.certificateTypes||0) };
    },
    getCertificateTypes(): string[] { return ['Transfer Certificate','Character Certificate','Bonafide Certificate','Migration Certificate','Mark Sheet','Scholarship Certificate']; },
};
