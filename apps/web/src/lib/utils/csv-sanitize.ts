/**
 * Neutralizes spreadsheet formula injection (CSV injection) while preserving
 * legitimate negative numeric literals (e.g. "-1250.50") and RFC 4180 quoting.
 */
export function sanitizeCsvValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    let text = String(value);
    if (
        /^(?:[\t\r\n]|[\s\u0000-\u001f]*[=+\-@|])/.test(text) &&
        !/^\s*-\d+(?:\.\d+)?$/.test(text)
    ) {
        text = `'${text}`;
    }
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
