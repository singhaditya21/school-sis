import { scoreInboundLead } from '@/lib/marketing/lead-scorer';
import {
    analyzeSpreadsheetAnomalies,
    buildPiiMaskedSampleForAi,
    inferColumnsFromSampleCells,
    parseDelimitedSpreadsheet,
} from '@/lib/import/legacy-erp-parser';
import { ALL_SEO_GUIDES, getGuideBySlug } from '../../../website/src/lib/seo-guides';

describe('Horizon 1 — Inbound Lead Scorer & Stealth Concierge', () => {
    it('scores a multi-campus DPDP / Tally institutional lead as HOT ENTERPRISE with stealth Institutional Desk signature', () => {
        const result = scoreInboundLead({
            contactName: 'Dr. Meenakshi Iyer',
            contactEmail: 'principal@heritageschool.edu.in',
            schoolName: 'Heritage Vidya Trust',
            studentCapacity: 5000,
            painPoints:
                '[DPDP Readiness Score: 42/100 · Grade C] Need Tally Prime XML voucher sync and 4-eyes concession approvals across 4 branches.',
            sourceUrl: 'https://school-sis-website.vercel.app/tools/dpdp-readiness',
            utmSource: 'organic_tool',
            utmMedium: 'interactive_diagnostic',
            utmCampaign: 'dpdp_readiness_scorer',
        });

        expect(result.score).toBeGreaterThanOrEqual(85);
        expect(result.priority).toBe('HOT');
        expect(result.recommendedTier).toBe('ENTERPRISE');
        expect(result.sourceLabel).toBe('DPDP Readiness Scorer');
        expect(result.focusModulePath).toBe('/executive');
        expect(result.tailoredOutreachPlainText).toContain('ScholarMind Institutional Desk');
        expect(result.conciergeAutoResponderHtml).toContain('ScholarMind Institutional Desk');
        expect(result.tailoredOutreachPlainText.toLowerCase()).not.toContain('aditya');
        expect(result.conciergeAutoResponderHtml.toLowerCase()).not.toContain('aditya');
    });

    it('routes mid-sized Tally Prime leads to /fees/accounting-sync and AI_PRO', () => {
        const result = scoreInboundLead({
            contactName: 'Rajesh Sharma',
            contactEmail: 'accounts@sunbeamacademy.org',
            schoolName: 'Sunbeam Senior Secondary',
            studentCapacity: 1500,
            painPoints: 'Manual Tally Prime voucher entry and overdue WhatsApp UPI fee recovery.',
            sourceUrl:
                'https://school-sis-website.vercel.app/guides/cbse-school-erp-tally-prime-integration',
        });

        expect(result.priority === 'HOT' || result.priority === 'WARM').toBe(true);
        expect(result.recommendedTier).toBe('AI_PRO');
        expect(result.sourceLabel).toBe('SEO Playbook');
        expect(result.focusModulePath).toBe('/fees/accounting-sync');
    });

    it('recommends CORE tier for sub-500 campus with generic enquiry on consumer email', () => {
        const result = scoreInboundLead({
            contactName: 'Kiran Verma',
            contactEmail: 'kiranvermaschool@gmail.com',
            schoolName: 'Little Star Public School',
            studentCapacity: 500,
            painPoints: 'Looking for basic attendance and student register.',
        });

        expect(result.recommendedTier).toBe('CORE');
        expect(result.score).toBeLessThan(60);
    });
});

describe('Horizon 1 — PII-Masked Spreadsheet Schema Inspector & Anomaly Auditor', () => {
    const messyCsv = [
        'Gr_No,Chhatra_Naam,Janam_Tithi,Kaksha_Section,Pita_Name,Whatsapp_Contact,Contact_Mail,Bakaya_Shulk,Aadhaar_Card',
        'GR-2026-101,Aarav Deshmukh,14/07/2014,Grade 6 - B,Prakash Deshmukh,9811002233,prakash.d@example.org,₹18500 Dr,4567 8901 2345',
        'GR-2026-102,Ananya Deshmukh,2016-09-22,Grade 4 - A,Prakash Deshmukh,9811002233,prakash.d@example.org,₹12000,5678 9012 3456',
        'GR-2026-103,Vihaan Joshi,03/11/2013,Grade 7 - A,Mahesh Joshi,,mahesh.j@example.org,0,',
    ].join('\n');

    it('scrubs student names, guardian phones, emails, and 12-digit Aadhaar IDs before external LLM sample construction', () => {
        const parsed = parseDelimitedSpreadsheet(messyCsv);
        const masked = buildPiiMaskedSampleForAi(parsed.headers, parsed.rows, 3);
        const serialized = JSON.stringify(masked);

        expect(serialized).not.toContain('Aarav');
        expect(serialized).not.toContain('Deshmukh');
        expect(serialized).not.toContain('9811002233');
        expect(serialized).not.toContain('prakash.d@example.org');
        expect(serialized).not.toContain('4567 8901 2345');
        expect(serialized).toContain('[10_DIGIT_MOBILE]');
        expect(serialized).toContain('[EMAIL_ADDRESS]');
        expect(serialized).toContain('[REDACTED_12_DIGIT_ID]');
    });

    it('infers regional/fuzzy headers and reports mixed dates, sibling phones, blank mobile rows, and opening arrears', () => {
        const parsed = parseDelimitedSpreadsheet(messyCsv);
        const inferred = inferColumnsFromSampleCells(parsed.headers, parsed.rows);

        expect(inferred.admissionNumber).toBe('Gr_No');
        expect(inferred.fullName).toBe('Chhatra_Naam');
        expect(inferred.dateOfBirth).toBe('Janam_Tithi');
        expect(inferred.gradeName).toBe('Kaksha_Section');
        expect(inferred.guardianName).toBe('Pita_Name');
        expect(inferred.guardianPhone).toBe('Whatsapp_Contact');
        expect(inferred.guardianEmail).toBe('Contact_Mail');
        expect(inferred.openingFeeBalance).toBe('Bakaya_Shulk');

        const report = analyzeSpreadsheetAnomalies(parsed.headers, parsed.rows, inferred);
        const joinedWarnings = report.warnings.join(' | ');

        expect(joinedWarnings).toContain('Mixed date formats');
        expect(joinedWarnings).toContain('shared sibling parent mobile');
        expect(joinedWarnings).toContain('blank parent mobile');
        expect(joinedWarnings).toContain('30,500');
        expect(report.unmappedHeaders).toContain('Aadhaar_Card');
    });
});

describe('Horizon 1 — Programmatic Organic SEO & GEO Guide Catalog', () => {
    it('exports 22 unique high-intent playbooks with structured FAQs and zero personal identifiers', () => {
        expect(ALL_SEO_GUIDES.length).toBe(22);
        const slugs = new Set(ALL_SEO_GUIDES.map((g) => g.slug));
        expect(slugs.size).toBe(22);

        expect(getGuideBySlug('cbse-school-erp-tally-prime-integration')).toBeDefined();
        expect(getGuideBySlug('dpdp-act-2023-section-9-compliance-indian-schools')).toBeDefined();
        expect(getGuideBySlug('migrate-entab-campuscare-to-scholarmind')).toBeDefined();
        expect(getGuideBySlug('cbse-icse-school-erp-delhi-ncr')).toBeDefined();

        for (const guide of ALL_SEO_GUIDES) {
            expect(guide.faqs.length).toBeGreaterThanOrEqual(2);
            const raw = JSON.stringify(guide).toLowerCase();
            expect(raw).not.toContain('aditya singh');
            expect(raw).not.toContain('singhaditya21');
        }
    });
});
