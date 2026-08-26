const ONES = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen',
];

const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function underHundred(n: number): string {
    if (n < 20) return ONES[n];
    const tens = TENS[Math.floor(n / 10)];
    const ones = ONES[n % 10];
    return ones ? `${tens} ${ones}` : tens;
}

function underThousand(n: number): string {
    const hundreds = Math.floor(n / 100);
    const remainder = n % 100;
    const parts: string[] = [];
    if (hundreds) parts.push(`${ONES[hundreds]} Hundred`);
    if (remainder) parts.push(underHundred(remainder));
    return parts.join(' ');
}

/** Indian numbering system: crore / lakh / thousand. */
function integerToWords(n: number): string {
    if (n === 0) return 'Zero';

    const crore = Math.floor(n / 10000000);
    const lakh = Math.floor((n % 10000000) / 100000);
    const thousand = Math.floor((n % 100000) / 1000);
    const rest = n % 1000;

    const parts: string[] = [];
    if (crore) parts.push(`${integerToWords(crore)} Crore`);
    if (lakh) parts.push(`${underHundred(lakh)} Lakh`);
    if (thousand) parts.push(`${underHundred(thousand)} Thousand`);
    if (rest) parts.push(underThousand(rest));
    return parts.join(' ');
}

/**
 * Render a rupee amount (as stored: numeric(12,2) in rupees) in words, the way
 * an Indian fee receipt states it. Returns null for anything unparseable so the
 * caller can simply omit the line rather than print something wrong.
 */
export function amountInWords(amount: string | number): string | null {
    const value = typeof amount === 'number' ? amount : Number(amount);
    if (!Number.isFinite(value) || value < 0) return null;

    const totalPaise = Math.round(value * 100);
    const rupees = Math.floor(totalPaise / 100);
    const paise = totalPaise % 100;

    let words = `${integerToWords(rupees)} Rupees`;
    if (paise > 0) words += ` and ${underHundred(paise)} Paise`;
    return `${words} Only`;
}
