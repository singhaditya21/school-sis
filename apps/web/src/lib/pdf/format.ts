/**
 * Text and number formatting for natively generated PDFs.
 *
 * jsPDF's built-in fonts (Helvetica et al.) are WinAnsi-encoded. Anything
 * outside Latin-1 — including the rupee sign U+20B9 — is emitted as raw bytes
 * and renders as garbage, so every string that reaches `doc.text()` goes
 * through `pdfText()` first and money is spelled "Rs." rather than "₹".
 */

const RUPEES = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** Typographic characters that have a sensible ASCII stand-in. */
const TRANSLITERATIONS: Record<string, string> = {
    '₹': 'Rs.',
    '‘': "'",
    '’': "'",
    '‚': "'",
    '“': '"',
    '”': '"',
    '„': '"',
    '–': '-',
    '—': '-',
    '−': '-',
    '…': '...',
    ' ': ' ',
    '•': '*',
    '·': '-',
    '→': '->',
    '✓': 'Yes',
};

/** The placeholder printed where a value is genuinely absent. */
export const EMPTY = '-';

/**
 * Fold a string down to something the core PDF fonts can actually draw.
 * Characters with no Latin-1 representation become '?' rather than being
 * dropped, so a mangled name is visibly mangled instead of silently shortened.
 */
export function pdfText(value: unknown): string {
    if (value === null || value === undefined) return '';
    let out = '';
    for (const char of String(value)) {
        const mapped = TRANSLITERATIONS[char];
        if (mapped !== undefined) {
            out += mapped;
            continue;
        }
        const code = char.codePointAt(0) ?? 0;
        if (char === '\n' || char === '\t') out += ' ';
        else if (code >= 0x20 && code <= 0xff) out += char;
        else out += '?';
    }
    return out;
}

/** A value for display, falling back to `EMPTY` when it is missing or blank. */
export function orEmpty(value: string | null | undefined): string {
    const text = pdfText(value).trim();
    return text.length > 0 ? text : EMPTY;
}

/**
 * Money as it is stored: numeric(12,2) in rupees, never paise. Two decimals are
 * kept because a receipt is an accounting document.
 */
export function formatRupees(value: string | number | null | undefined): string {
    const amount = typeof value === 'number' ? value : Number(value ?? NaN);
    if (!Number.isFinite(amount)) return EMPTY;
    return `Rs. ${RUPEES.format(amount)}`;
}

/**
 * `dd Mon yyyy`. Date-only columns arrive from node-postgres either as a
 * 'YYYY-MM-DD' string or as a Date pinned to local midnight; the string form is
 * read literally so the calendar date cannot drift across a timezone.
 */
export function formatPdfDate(value: Date | string | null | undefined): string {
    if (value === null || value === undefined || value === '') return EMPTY;

    if (typeof value === 'string') {
        const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
        if (match) {
            const month = MONTHS[Number(match[2]) - 1];
            if (month) return `${match[3]} ${month} ${match[1]}`;
        }
    }

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return EMPTY;
    return `${String(date.getDate()).padStart(2, '0')} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** A filename fragment that is safe in a Content-Disposition header. */
export function filenameSlug(value: string | null | undefined, fallback: string): string {
    const slug = String(value ?? '')
        .normalize('NFKD')
        .replace(/[^A-Za-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
    return slug.length > 0 ? slug : fallback;
}
