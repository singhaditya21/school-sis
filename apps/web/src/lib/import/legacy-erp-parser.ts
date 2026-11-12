/**
 * 48-Hour Legacy ERP Migration Parser & Column Auto-Mapper
 *
 * Pure TypeScript module (zero DB/Node dependencies) supporting CSV/TSV exports
 * from Entab CampusCare, Fedena, MyClassboard (MCB), Edunext, Tally, and Excel.
 */

export type LegacyErpPreset =
    | 'AUTO'
    | 'ENTAB'
    | 'FEDENA'
    | 'MCB'
    | 'EDUNEXT'
    | 'TALLY'
    | 'SCHOLARMIND_CSV';

export type TargetFieldKey =
    | 'admissionNumber'
    | 'firstName'
    | 'lastName'
    | 'fullName'
    | 'dateOfBirth'
    | 'gender'
    | 'gradeName'
    | 'sectionName'
    | 'rollNumber'
    | 'bloodGroup'
    | 'guardianName'
    | 'guardianRelation'
    | 'guardianPhone'
    | 'guardianEmail'
    | 'city'
    | 'state'
    | 'pincode'
    | 'openingFeeBalance'
    | 'feeDescription';

export type ColumnMapping = Partial<Record<TargetFieldKey, string>>;

export interface ParsedSpreadsheet {
    delimiter: ',' | '\t';
    headers: string[];
    rows: Array<Record<string, string>>;
}

export interface NormalizedLegacyStudentRow {
    rowNumber: number;
    admissionNumber: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    gender: 'MALE' | 'FEMALE' | 'OTHER';
    gradeName: string;
    sectionName: string;
    rollNumber: number | null;
    bloodGroup: 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-' | null;
    guardianFirstName: string | null;
    guardianLastName: string | null;
    guardianRelation: 'FATHER' | 'MOTHER' | 'GUARDIAN' | 'OTHER';
    guardianPhone: string | null;
    guardianEmail: string | null;
    city: string | null;
    state: string | null;
    pincode: string | null;
    openingFeeBalance: number;
    feeDescription: string | null;
    errors: string[];
}

export const SAMPLE_LEGACY_ERP_CSV = [
    'Adm_No,Pupil_Name,DOB,Gender,Class_Section,Roll_No,Blood_Group,Father_Name,Father_Mobile,Parent_Email,City,State,Pincode,Fee_Arrears,Fee_Remarks',
    'ENT-2026-501,Rohan Kulkarni,14/06/2013,Male,Grade 7 - A,11,B+,Suresh Kulkarni,9811223344,suresh.k@example.org,Pune,Maharashtra,411001,14500,Q1 Carryforward Balance',
    'ENT-2026-502,Sneha Kulkarni,21/09/2015,Female,Grade 5 - A,7,O+,Suresh Kulkarni,9811223344,suresh.k@example.org,Pune,Maharashtra,411001,12000,Q1 Carryforward Balance',
    'ENT-2026-503,Aditya Menon,03/11/2011,M,Grade 9 - B,4,A+,Rajesh Menon,9822334455,rajesh.menon@example.org,Kochi,Kerala,682001,0,Cleared in Legacy ERP',
    'ENT-2026-504,Zoya Siddiqui,19/02/2012,F,Grade 8 - A,19,AB+,Farhan Siddiqui,9833445566,farhan.s@example.org,Lucknow,Uttar Pradesh,226001,24800,Tuition + Bus Opening Due',
    'ENT-2026-505,Harshvardhan Rao,28/07/2010,Male,Grade 10 - A,2,O-,Venkatesh Rao,9844556677,v.rao@example.org,Hyderabad,Telangana,500033,9500,Lab & Term 1 Balance',
].join('\n');

const VALID_BLOOD_GROUPS = new Set([
    'A+',
    'A-',
    'B+',
    'B-',
    'AB+',
    'AB-',
    'O+',
    'O-',
]);

const FIELD_ALIASES: Record<TargetFieldKey, readonly string[]> = {
    admissionNumber: [
        'admission_number',
        'admission_no',
        'adm_no',
        'admno',
        'enrollmentno',
        'enrollment_no',
        'scholar_no',
        'alias_admno',
        'reg_no',
        'sr_no',
        'student_id',
    ],
    firstName: ['first_name', 'firstname', 'student_first_name', 'given_name'],
    lastName: ['last_name', 'lastname', 'surname', 'student_last_name', 'family_name'],
    fullName: [
        'pupil_name',
        'student_name',
        'studentfullname',
        'full_name',
        'fullname',
        'name',
        'ledger_name',
    ],
    dateOfBirth: ['date_of_birth', 'dob', 'birth_date', 'birthdate', 'd_o_b'],
    gender: ['gender', 'sex'],
    gradeName: ['grade', 'grade_name', 'class', 'class_name', 'standard', 'batch_name', 'class_section', 'classsection'],
    sectionName: ['section', 'section_name', 'sec', 'division', 'div'],
    rollNumber: ['roll_number', 'roll_no', 'rollno', 'roll'],
    bloodGroup: ['blood_group', 'bloodgroup', 'blood'],
    guardianName: [
        'guardian_name',
        'father_name',
        'fathername',
        'parent_name',
        'mother_name',
        'immediate_contact_name',
    ],
    guardianRelation: ['guardian_relation', 'relation', 'relationship'],
    guardianPhone: [
        'guardian_phone',
        'father_mobile',
        'parent_mobile',
        'parentcontact',
        'parent_contact',
        'immediate_contact_phone',
        'mobile',
        'phone',
        'whatsapp_no',
    ],
    guardianEmail: ['guardian_email', 'parent_email', 'father_email', 'email'],
    city: ['city', 'town', 'district'],
    state: ['state', 'province'],
    pincode: ['pincode', 'pin_code', 'zip', 'postal_code', 'pin'],
    openingFeeBalance: [
        'opening_fee_balance',
        'opening_balance',
        'fee_arrears',
        'balance_due',
        'pendingdues',
        'pending_dues',
        'closing_balance',
        'arrears',
        'due_amount',
    ],
    feeDescription: ['fee_description', 'fee_remarks', 'remarks', 'narration'],
};

function normalizeHeaderToken(header: string): string {
    return header
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function splitDelimitedLines(rawText: string, delimiter: ',' | '\t'): string[][] {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = '';
    let inQuotes = false;

    const cleaned = rawText.replace(/^\uFEFF/, '');
    for (let i = 0; i < cleaned.length; i++) {
        const ch = cleaned[i];
        const next = cleaned[i + 1];

        if (inQuotes) {
            if (ch === '"' && next === '"') {
                currentCell += '"';
                i++;
            } else if (ch === '"') {
                inQuotes = false;
            } else {
                currentCell += ch;
            }
            continue;
        }

        if (ch === '"') {
            inQuotes = true;
            continue;
        }

        if (ch === delimiter) {
            currentRow.push(currentCell.trim());
            currentCell = '';
            continue;
        }

        if (ch === '\r' && next === '\n') {
            currentRow.push(currentCell.trim());
            if (currentRow.some((cell) => cell.length > 0)) {
                rows.push(currentRow);
            }
            currentRow = [];
            currentCell = '';
            i++;
            continue;
        }

        if (ch === '\n' || ch === '\r') {
            currentRow.push(currentCell.trim());
            if (currentRow.some((cell) => cell.length > 0)) {
                rows.push(currentRow);
            }
            currentRow = [];
            currentCell = '';
            continue;
        }

        currentCell += ch;
    }

    currentRow.push(currentCell.trim());
    if (currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow);
    }

    return rows;
}

export function parseDelimitedSpreadsheet(rawText: string): ParsedSpreadsheet {
    const firstLine = (rawText.split(/\r?\n/)[0] || '').trim();
    const tabCount = (firstLine.match(/\t/g) || []).length;
    const commaCount = (firstLine.match(/,/g) || []).length;
    const delimiter: ',' | '\t' = tabCount > commaCount ? '\t' : ',';

    const matrix = splitDelimitedLines(rawText, delimiter);
    if (matrix.length === 0) {
        return { delimiter, headers: [], rows: [] };
    }

    const headers = matrix[0].map((h, idx) => h || `Column_${idx + 1}`);
    const rows = matrix.slice(1).map((cells) => {
        const record: Record<string, string> = {};
        headers.forEach((header, idx) => {
            record[header] = (cells[idx] ?? '').trim();
        });
        return record;
    });

    return { delimiter, headers, rows };
}

export function autoMapLegacyColumns(headers: string[]): ColumnMapping {
    const mapping: ColumnMapping = {};
    const normalizedMap = new Map<string, string>();
    for (const h of headers) {
        normalizedMap.set(normalizeHeaderToken(h), h);
    }

    (Object.keys(FIELD_ALIASES) as TargetFieldKey[]).forEach((targetKey) => {
        for (const alias of FIELD_ALIASES[targetKey]) {
            const matchedHeader = normalizedMap.get(alias);
            if (matchedHeader) {
                mapping[targetKey] = matchedHeader;
                break;
            }
        }
    });

    return mapping;
}

export function normalizeLegacyDate(raw: string): string | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    // ISO YYYY-MM-DD or YYYY/MM/DD
    const isoMatch = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (isoMatch) {
        const year = Number(isoMatch[1]);
        const month = Number(isoMatch[2]);
        const day = Number(isoMatch[3]);
        if (isValidCalendarDate(year, month, day)) {
            return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
        return null;
    }

    // Indian DD/MM/YYYY or DD-MM-YYYY
    const dmyMatch = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (dmyMatch) {
        const day = Number(dmyMatch[1]);
        const month = Number(dmyMatch[2]);
        const year = Number(dmyMatch[3]);
        if (isValidCalendarDate(year, month, day)) {
            return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
        return null;
    }

    return null;
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
    if (year < 1980 || year > 2035 || month < 1 || month > 12 || day < 1 || day > 31) {
        return false;
    }
    const dt = new Date(Date.UTC(year, month - 1, day));
    return (
        dt.getUTCFullYear() === year &&
        dt.getUTCMonth() === month - 1 &&
        dt.getUTCDate() === day
    );
}

function stripLeadingFormulaChars(value: string): string {
    return value.replace(/^(?:[\t\r\n]|[\s\u0000-\u001f]*[=+\-@|])+/, '').trim();
}

function splitPersonName(fullName: string): { firstName: string; lastName: string } {
    const cleaned = stripLeadingFormulaChars(fullName);
    const parts = cleaned.split(/\s+/).map(stripLeadingFormulaChars).filter(Boolean);
    if (parts.length === 0) return { firstName: '', lastName: '' };
    if (parts.length === 1) return { firstName: parts[0], lastName: '-' };
    return {
        firstName: parts[0],
        lastName: parts.slice(1).join(' '),
    };
}

function splitGradeAndSection(
    rawGrade: string,
    rawSection: string,
): { gradeName: string; sectionName: string } {
    const cleanGrade = rawGrade.trim();
    const cleanSection = rawSection.trim();
    if (cleanSection) {
        return { gradeName: cleanGrade, sectionName: cleanSection.toUpperCase() };
    }

    // Match combined forms like "Grade 8 - B", "Class 10-A", "10 B"
    const combined = cleanGrade.match(/^(.+?)\s*[-/]\s*([A-Za-z0-9]{1,4})$/);
    if (combined) {
        return {
            gradeName: combined[1].trim(),
            sectionName: combined[2].trim().toUpperCase(),
        };
    }

    return {
        gradeName: cleanGrade,
        sectionName: 'A',
    };
}

function parseGender(raw: string): 'MALE' | 'FEMALE' | 'OTHER' {
    const val = raw.trim().toLowerCase();
    if (val === 'm' || val === 'male' || val === 'boy') return 'MALE';
    if (val === 'f' || val === 'female' || val === 'girl') return 'FEMALE';
    return 'OTHER';
}

function parseRelation(raw: string): 'FATHER' | 'MOTHER' | 'GUARDIAN' | 'OTHER' {
    const val = raw.trim().toUpperCase();
    if (val === 'MOTHER') return 'MOTHER';
    if (val === 'GUARDIAN') return 'GUARDIAN';
    if (val === 'OTHER') return 'OTHER';
    return 'FATHER';
}

function parseFeeAmount(raw: string): { ok: true; value: number } | { ok: false } {
    if (!raw.trim()) return { ok: true, value: 0 };
    const cleaned = raw
        .replace(/[₹$,\s]/g, '')
        .replace(/(?:dr|cr)\.?$/i, '')
        .trim();
    if (!cleaned || cleaned === '-') return { ok: true, value: 0 };
    const num = Number(cleaned);
    if (!Number.isFinite(num) || num < 0 || num > 10000000) {
        return { ok: false };
    }
    return { ok: true, value: Math.round(num * 100) / 100 };
}

export function normalizeLegacyRow(
    rawRow: Record<string, string>,
    mapping: ColumnMapping,
    rowNumber: number,
): NormalizedLegacyStudentRow {
    const getVal = (key: TargetFieldKey): string => {
        const col = mapping[key];
        return col ? (rawRow[col] ?? '').trim() : '';
    };

    const errors: string[] = [];
    const admissionNumber = getVal('admissionNumber').toUpperCase();
    if (!admissionNumber) {
        errors.push('Missing Admission Number');
    } else if (admissionNumber.length > 50) {
        errors.push('Admission Number exceeds 50 characters');
    }

    let firstName = stripLeadingFormulaChars(getVal('firstName'));
    let lastName = stripLeadingFormulaChars(getVal('lastName'));
    if (!firstName) {
        const split = splitPersonName(getVal('fullName'));
        firstName = split.firstName;
        lastName = lastName || split.lastName;
    }
    if (!firstName) {
        errors.push('Missing Student Name');
    }
    if (!lastName) {
        lastName = '-';
    }

    const rawDob = getVal('dateOfBirth');
    const normalizedDob = rawDob ? normalizeLegacyDate(rawDob) : '2014-01-01';
    if (rawDob && !normalizedDob) {
        errors.push(`Invalid Date of Birth "${rawDob}" (use DD/MM/YYYY or YYYY-MM-DD)`);
    }

    const { gradeName, sectionName } = splitGradeAndSection(
        getVal('gradeName'),
        getVal('sectionName'),
    );
    if (!gradeName) {
        errors.push('Missing Class / Grade');
    }

    const rawRoll = getVal('rollNumber');
    let rollNumber: number | null = null;
    if (rawRoll) {
        const parsedRoll = Number.parseInt(rawRoll, 10);
        if (Number.isFinite(parsedRoll) && parsedRoll > 0 && parsedRoll < 10000) {
            rollNumber = parsedRoll;
        }
    }

    const rawBlood = getVal('bloodGroup').toUpperCase();
    const bloodGroup = VALID_BLOOD_GROUPS.has(rawBlood)
        ? (rawBlood as NormalizedLegacyStudentRow['bloodGroup'])
        : null;

    const guardianSplit = splitPersonName(getVal('guardianName'));
    const rawPhone = getVal('guardianPhone');
    const cleanPhoneDigits = rawPhone.replace(/\D/g, '');
    if (rawPhone && (cleanPhoneDigits.length < 10 || cleanPhoneDigits.length > 15)) {
        errors.push(`Invalid Guardian Phone "${rawPhone}"`);
    }

    const rawEmail = getVal('guardianEmail').toLowerCase();
    if (rawEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(rawEmail)) {
        errors.push(`Invalid Guardian Email "${rawEmail}"`);
    }

    const feeParsed = parseFeeAmount(getVal('openingFeeBalance'));
    if (feeParsed.ok === false) {
        errors.push(`Invalid Opening Fee Balance "${getVal('openingFeeBalance')}"`);
    }

    return {
        rowNumber,
        admissionNumber: admissionNumber.slice(0, 50),
        firstName: firstName.slice(0, 100),
        lastName: lastName.slice(0, 100),
        dateOfBirth: normalizedDob || '2014-01-01',
        gender: parseGender(getVal('gender')),
        gradeName: gradeName.slice(0, 50),
        sectionName: (sectionName || 'A').slice(0, 20),
        rollNumber,
        bloodGroup,
        guardianFirstName: guardianSplit.firstName ? guardianSplit.firstName.slice(0, 100) : null,
        guardianLastName: guardianSplit.lastName ? guardianSplit.lastName.slice(0, 100) : null,
        guardianRelation: parseRelation(getVal('guardianRelation')),
        guardianPhone: cleanPhoneDigits ? `+${cleanPhoneDigits.length === 10 ? `91${cleanPhoneDigits}` : cleanPhoneDigits}` : null,
        guardianEmail: rawEmail || null,
        city: getVal('city').slice(0, 100) || null,
        state: getVal('state').slice(0, 100) || null,
        pincode: getVal('pincode').slice(0, 10) || null,
        openingFeeBalance: feeParsed.ok ? feeParsed.value : 0,
        feeDescription: getVal('feeDescription').slice(0, 160) || null,
        errors,
    };
}

export const ALL_TARGET_FIELD_KEYS: readonly TargetFieldKey[] = [
    'admissionNumber',
    'firstName',
    'lastName',
    'fullName',
    'dateOfBirth',
    'gender',
    'gradeName',
    'sectionName',
    'rollNumber',
    'bloodGroup',
    'guardianName',
    'guardianRelation',
    'guardianPhone',
    'guardianEmail',
    'city',
    'state',
    'pincode',
    'openingFeeBalance',
    'feeDescription',
];

const FUZZY_SUBSTRING_HINTS: Array<{ target: TargetFieldKey; pattern: RegExp }> = [
    { target: 'admissionNumber', pattern: /(?:adm|enrol|scholar|gr_no|grno|reg_?no|uid|pravesh)/i },
    { target: 'fullName', pattern: /(?:pupil|student.*name|chhatra|vidyarthi|candidate|ward_name)/i },
    { target: 'dateOfBirth', pattern: /(?:birth|dob|janam|bday)/i },
    { target: 'gradeName', pattern: /(?:class|grade|std|kaksha|batch|course)/i },
    { target: 'sectionName', pattern: /(?:section|division|varg|stream)/i },
    { target: 'guardianName', pattern: /(?:father|mother|parent|guardian|pita|mata|abhibhavak)/i },
    { target: 'guardianPhone', pattern: /(?:mobile|whatsapp|contact|cell|sms|phone|sampark)/i },
    { target: 'guardianEmail', pattern: /(?:mail)/i },
    { target: 'openingFeeBalance', pattern: /(?:arrear|balance|due|bakaya|pending|outstanding|carryforward)/i },
    { target: 'feeDescription', pattern: /(?:remark|narrat|note|particular)/i },
    { target: 'pincode', pattern: /(?:pin|postal|zip)/i },
];

/**
 * Masks PII inside sample cell values into structural descriptors so an external LLM
 * can understand column formats (dates, 10-digit phones, ₹ amounts, classes) without
 * ever receiving student/guardian names, phone numbers, emails, or ID numbers.
 */
export function maskCellShapeForAi(rawCell: string): string {
    const trimmed = rawCell.trim();
    if (!trimmed) return '';

    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        return '[EMAIL_ADDRESS]';
    }
    const digitsOnly = trimmed.replace(/\D/g, '');
    if (digitsOnly.length === 12 && /^[2-9]\d{11}$/.test(digitsOnly)) {
        return '[REDACTED_12_DIGIT_ID]';
    }
    if (digitsOnly.length >= 10 && digitsOnly.length <= 15 && /^[\d+\s().-]+$/.test(trimmed)) {
        return '[10_DIGIT_MOBILE]';
    }
    if (/^\d{6}$/.test(trimmed)) {
        return '411001';
    }
    if (/^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}$/.test(trimmed)) {
        return '15/06/2014';
    }
    if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(trimmed)) {
        return '2014-06-15';
    }
    if (/^(?:m|f|male|female|boy|girl|other)$/i.test(trimmed)) {
        return trimmed;
    }
    if (VALID_BLOOD_GROUPS.has(trimmed.toUpperCase())) {
        return trimmed.toUpperCase();
    }
    if (/(?:grade|class|std|nursery|lkg|ukg|xi|xii)/i.test(trimmed)) {
        return trimmed.slice(0, 24);
    }
    if (/^[₹$]?\s*\d[\d,.]*(?:\s*(?:dr|cr)\.?)?$/i.test(trimmed)) {
        return trimmed.slice(0, 20);
    }
    if (/^[A-Za-z]{1,6}[-/]\d{2,6}(?:[-/]\d{1,6})?$/.test(trimmed)) {
        return 'ADM-2026-001';
    }
    // Generic text (e.g. person name or remark) -> preserve word count shape without real names
    const wordCount = trimmed.split(/\s+/).length;
    return wordCount >= 2 ? '[TWO_WORD_TEXT]' : '[TEXT_TOKEN]';
}

export function buildPiiMaskedSampleForAi(
    headers: string[],
    rows: Array<Record<string, string>>,
    maxRows = 3,
): Array<Record<string, string>> {
    return rows.slice(0, maxRows).map((row) => {
        const masked: Record<string, string> = {};
        for (const h of headers) {
            masked[h] = maskCellShapeForAi(row[h] ?? '');
        }
        return masked;
    });
}

/**
 * Enhances alias mapping by inspecting fuzzy substrings and sample cell shapes
 * across up to 8 rows for columns that did not match exact aliases.
 */
export function inferColumnsFromSampleCells(
    headers: string[],
    rows: Array<Record<string, string>>,
    baseMapping?: ColumnMapping,
): ColumnMapping {
    const resolved: ColumnMapping = {
        ...autoMapLegacyColumns(headers),
        ...(baseMapping || {}),
    };
    const usedHeaders = new Set<string>(Object.values(resolved).filter((v): v is string => Boolean(v)));
    const sampleSlice = rows.slice(0, 8);

    // Pass 1: Fuzzy header substring matching for unmapped target fields
    for (const { target, pattern } of FUZZY_SUBSTRING_HINTS) {
        if (resolved[target]) continue;
        // Skip fullName if firstName is already mapped
        if (target === 'fullName' && resolved.firstName) continue;
        const candidate = headers.find((h) => !usedHeaders.has(h) && pattern.test(normalizeHeaderToken(h)));
        if (candidate) {
            resolved[target] = candidate;
            usedHeaders.add(candidate);
        }
    }

    // Pass 2: Cell-value pattern detection on remaining unmapped headers
    for (const header of headers) {
        if (usedHeaders.has(header)) continue;
        const values = sampleSlice.map((r) => (r[header] ?? '').trim()).filter(Boolean);
        if (values.length === 0) continue;

        if (!resolved.guardianEmail && values.every((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))) {
            resolved.guardianEmail = header;
            usedHeaders.add(header);
            continue;
        }
        if (
            !resolved.guardianPhone &&
            values.every((v) => {
                const d = v.replace(/\D/g, '');
                return d.length >= 10 && d.length <= 13 && /^[\d+\s().-]+$/.test(v);
            })
        ) {
            resolved.guardianPhone = header;
            usedHeaders.add(header);
            continue;
        }
        if (!resolved.dateOfBirth && values.every((v) => normalizeLegacyDate(v) !== null)) {
            resolved.dateOfBirth = header;
            usedHeaders.add(header);
            continue;
        }
        if (
            !resolved.gradeName &&
            values.every((v) => /^(?:grade|class|std|nursery|kg|lkg|ukg|\d{1,2}\s*[-/]\s*[A-Za-z])/i.test(v))
        ) {
            resolved.gradeName = header;
            usedHeaders.add(header);
            continue;
        }
    }

    return resolved;
}

export interface SpreadsheetAnomalyReport {
    summary: string;
    warnings: string[];
    unmappedHeaders: string[];
}

export function analyzeSpreadsheetAnomalies(
    headers: string[],
    rows: Array<Record<string, string>>,
    mapping: ColumnMapping,
): SpreadsheetAnomalyReport {
    const warnings: string[] = [];
    const mappedHeaderSet = new Set(Object.values(mapping).filter((v): v is string => Boolean(v)));
    const unmappedHeaders = headers.filter((h) => !mappedHeaderSet.has(h));

    if (!mapping.admissionNumber) {
        warnings.push('Admission / Enrollment Number column is not mapped yet — select the unique student ID column before dry-run.');
    }
    if (!mapping.fullName && !mapping.firstName) {
        warnings.push('Student Name column is not mapped yet — map either Student Full Name or Student First Name.');
    }
    if (!mapping.gradeName) {
        warnings.push('Class / Grade column is not mapped yet — required to assign academic cohorts.');
    }

    // Check date format mix
    if (mapping.dateOfBirth) {
        let dmyCount = 0;
        let isoCount = 0;
        let invalidDobCount = 0;
        for (const row of rows) {
            const raw = (row[mapping.dateOfBirth] ?? '').trim();
            if (!raw) continue;
            if (/^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}$/.test(raw)) dmyCount += 1;
            else if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(raw)) isoCount += 1;
            if (!normalizeLegacyDate(raw)) invalidDobCount += 1;
        }
        if (dmyCount > 0 && isoCount > 0) {
            warnings.push(
                `Mixed date formats detected in "${mapping.dateOfBirth}" (${dmyCount} DD/MM/YYYY and ${isoCount} YYYY-MM-DD rows) — ScholarMind will normalize both automatically.`,
            );
        }
        if (invalidDobCount > 0) {
            warnings.push(
                `${invalidDobCount} row(s) have unrecognizable birth dates in "${mapping.dateOfBirth}" — inspect them in Dry-Run preview.`,
            );
        }
    }

    // Check combined Class + Section & sibling phone sharing & missing phones
    if (mapping.gradeName && !mapping.sectionName) {
        const combinedCount = rows.filter((r) =>
            /^.+?\s*[-/]\s*[A-Za-z0-9]{1,4}$/.test((r[mapping.gradeName!] ?? '').trim()),
        ).length;
        if (combinedCount > 0) {
            warnings.push(
                `Combined Class-Section values detected in "${mapping.gradeName}" (${combinedCount} rows like "Grade 7 - A") — sections will be split automatically.`,
            );
        }
    }

    if (mapping.guardianPhone) {
        const phones = new Map<string, number>();
        let missingPhones = 0;
        for (const row of rows) {
            const digits = (row[mapping.guardianPhone] ?? '').replace(/\D/g, '');
            if (!digits) {
                missingPhones += 1;
            } else if (digits.length >= 10) {
                const key = digits.slice(-10);
                phones.set(key, (phones.get(key) || 0) + 1);
            }
        }
        const siblingGroups = [...phones.values()].filter((c) => c > 1).length;
        if (siblingGroups > 0) {
            warnings.push(
                `${siblingGroups} shared sibling parent mobile number(s) found — siblings will be linked cleanly under unified AES-256 encrypted guardian records.`,
            );
        }
        if (missingPhones > 0) {
            warnings.push(
                `${missingPhones} row(s) have blank parent mobile numbers — students will import, but WhatsApp UPI fee links require guardian phones.`,
            );
        }
    }

    if (mapping.openingFeeBalance) {
        let withArrears = 0;
        let totalArrears = 0;
        for (const row of rows) {
            const parsed = parseFeeAmount(row[mapping.openingFeeBalance] ?? '');
            if (parsed.ok && parsed.value > 0) {
                withArrears += 1;
                totalArrears += parsed.value;
            }
        }
        if (withArrears > 0) {
            warnings.push(
                `${withArrears} student(s) carry opening fee arrears totaling ₹${Math.round(totalArrears).toLocaleString('en-IN')} — opening invoices will be created atomically on commit.`,
            );
        }
    }

    const mappedCount = Object.values(mapping).filter(Boolean).length;
    const summary = `Mapped ${mappedCount} of ${headers.length} columns across ${rows.length} student row(s)${
        unmappedHeaders.length > 0 ? ` (${unmappedHeaders.length} auxiliary column(s) left unmapped)` : ''
    }.`;

    return {
        summary,
        warnings,
        unmappedHeaders,
    };
}
