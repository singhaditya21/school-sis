/**
 * Zero-Cost Institutional Accounting Voucher Formatters
 *
 * Supports three zero-middleware accounting targets from a single payment ledger:
 *  1. TallyPrime / Tally ERP 9 XML (`tally_xml`) — with SVCURRENTCOMPANY + deterministic GUID deduplication
 *  2. Zoho Books / Busy Double-Entry Journal CSV (`zoho_csv`) — direct CSV upload, zero Zoho paid add-ons
 *  3. Frappe ERPNext Open-Source JSON (`erpnext_json`) — `frappe/erpnext` ₹0/$0 open-source accounting ERP
 */

import { sanitizeCsvValue } from '@/lib/utils/csv-sanitize';

export type AccountingExportFormat = 'tally_xml' | 'zoho_csv' | 'erpnext_json';

export type PaymentLedgerMethodKey =
    | 'CASH'
    | 'CARD'
    | 'UPI'
    | 'BANK_TRANSFER'
    | 'CHEQUE'
    | 'ONLINE';

export interface AccountingLedgerConfig {
    tallyCompanyName: string;
    receivableLedgerPrefix: string;
    ledgerMappings: Record<PaymentLedgerMethodKey, string>;
}

export interface AccountingPaymentRow {
    id: string;
    amount: string | number;
    method: string;
    paidAt: string | Date;
    providerReference?: string | null;
    invoiceNumber: string;
    studentName: string;
    admissionNumber: string;
    grade?: string | null;
}

export const DEFAULT_LEDGER_MAPPINGS: Record<PaymentLedgerMethodKey, string> = {
    CASH: 'Cash',
    CARD: 'HDFC Bank',
    UPI: 'UPI Collections',
    BANK_TRANSFER: 'Bank Collections',
    CHEQUE: 'Cheque Collections',
    ONLINE: 'Online Payments',
};

export function normalizeAccountingLedgerConfig(
    raw: unknown,
    fallbackCompanyName = 'ScholarMind Educational Trust',
): AccountingLedgerConfig {
    const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const accountingSub =
        obj.accounting && typeof obj.accounting === 'object'
            ? (obj.accounting as Record<string, unknown>)
            : obj;
    const rawMappings =
        accountingSub.ledgerMappings && typeof accountingSub.ledgerMappings === 'object'
            ? (accountingSub.ledgerMappings as Record<string, unknown>)
            : {};

    const cleanStr = (val: unknown, fallback: string, maxLen = 80): string => {
        if (typeof val !== 'string') return fallback;
        const trimmed = val.trim();
        return trimmed.length > 0 ? trimmed.slice(0, maxLen) : fallback;
    };

    return {
        tallyCompanyName: cleanStr(accountingSub.tallyCompanyName, fallbackCompanyName, 120),
        receivableLedgerPrefix: cleanStr(
            accountingSub.receivableLedgerPrefix,
            'Fee Collections',
            80,
        ),
        ledgerMappings: {
            CASH: cleanStr(rawMappings.CASH, DEFAULT_LEDGER_MAPPINGS.CASH),
            CARD: cleanStr(rawMappings.CARD, DEFAULT_LEDGER_MAPPINGS.CARD),
            UPI: cleanStr(rawMappings.UPI, DEFAULT_LEDGER_MAPPINGS.UPI),
            BANK_TRANSFER: cleanStr(
                rawMappings.BANK_TRANSFER,
                DEFAULT_LEDGER_MAPPINGS.BANK_TRANSFER,
            ),
            CHEQUE: cleanStr(rawMappings.CHEQUE, DEFAULT_LEDGER_MAPPINGS.CHEQUE),
            ONLINE: cleanStr(rawMappings.ONLINE, DEFAULT_LEDGER_MAPPINGS.ONLINE),
        },
    };
}

export function resolveTargetLedgerName(
    method: string,
    config: AccountingLedgerConfig,
): string {
    const upper = String(method || '').trim().toUpperCase();
    if (upper === 'CASH') return config.ledgerMappings.CASH;
    if (upper === 'CARD') return config.ledgerMappings.CARD;
    if (upper === 'UPI') return config.ledgerMappings.UPI;
    if (upper === 'BANK_TRANSFER' || upper === 'NEFT' || upper === 'RTGS' || upper === 'IMPS') {
        return config.ledgerMappings.BANK_TRANSFER;
    }
    if (upper === 'CHEQUE' || upper === 'DD') return config.ledgerMappings.CHEQUE;
    if (upper === 'ONLINE' || upper === 'ONLINE_GATEWAY' || upper === 'RAZORPAY' || upper === 'STRIPE') {
        return config.ledgerMappings.ONLINE;
    }
    return config.ledgerMappings.ONLINE || 'Sundry Collections';
}

export function formatIsoDate(date: string | Date): string {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) {
        return new Date().toISOString().slice(0, 10);
    }
    return d.toISOString().slice(0, 10);
}

export function formatTallyDate(date: string | Date): string {
    return formatIsoDate(date).replace(/-/g, '');
}

export function escapeXml(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function escapeCsvCell(value: unknown): string {
    return sanitizeCsvValue(value);
}

/**
 * 1. TallyPrime / Tally ERP 9 Receipt Vouchers XML
 */
export function buildTallyPrimeXml(
    payments: AccountingPaymentRow[],
    config: AccountingLedgerConfig,
): string {
    const vouchers = payments
        .map((p) => {
            const amountFixed = Number(p.amount || 0).toFixed(2);
            const guid = `scholarmind-${p.id}`;
            const debitLedger = resolveTargetLedgerName(p.method, config);
            const creditLedger = `${config.receivableLedgerPrefix} - ${p.grade || 'General'}`;
            const narration = [
                `Fee Receipt - ${p.studentName} (${p.admissionNumber})`,
                `Invoice #${p.invoiceNumber}`,
                p.providerReference ? `Ref ${p.providerReference}` : null,
            ]
                .filter(Boolean)
                .join(' - ');

            return `                <VOUCHER REMOTEID="${escapeXml(guid)}" VCHTYPE="Receipt" ACTION="Create" OBJVIEW="Accounting Voucher View">
                    <GUID>${escapeXml(guid)}</GUID>
                    <DATE>${formatTallyDate(p.paidAt)}</DATE>
                    <NARRATION>${escapeXml(narration)}</NARRATION>
                    <VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>
                    <VOUCHERNUMBER>${escapeXml(p.id.slice(0, 8).toUpperCase())}</VOUCHERNUMBER>
                    <PARTYLEDGERNAME>${escapeXml(p.studentName)}</PARTYLEDGERNAME>
                    <ALLLEDGERENTRIES.LIST>
                        <LEDGERNAME>${escapeXml(debitLedger)}</LEDGERNAME>
                        <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                        <AMOUNT>-${amountFixed}</AMOUNT>
                    </ALLLEDGERENTRIES.LIST>
                    <ALLLEDGERENTRIES.LIST>
                        <LEDGERNAME>${escapeXml(creditLedger)}</LEDGERNAME>
                        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                        <AMOUNT>${amountFixed}</AMOUNT>
                    </ALLLEDGERENTRIES.LIST>
                </VOUCHER>`;
        })
        .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
    <HEADER>
        <TALLYREQUEST>Import Data</TALLYREQUEST>
    </HEADER>
    <BODY>
        <IMPORTDATA>
            <REQUESTDESC>
                <REPORTNAME>Vouchers</REPORTNAME>
                <STATICVARIABLES>
                    <SVCURRENTCOMPANY>${escapeXml(config.tallyCompanyName)}</SVCURRENTCOMPANY>
                </STATICVARIABLES>
            </REQUESTDESC>
            <REQUESTDATA>
                <TALLYMESSAGE xmlns:UDF="TallyUDF">
${vouchers}
                </TALLYMESSAGE>
            </REQUESTDATA>
        </IMPORTDATA>
    </BODY>
</ENVELOPE>`;
}

/**
 * 2. Zoho Books / Busy Double-Entry Journal CSV
 */
export function buildZohoBooksCsv(
    payments: AccountingPaymentRow[],
    config: AccountingLedgerConfig,
): string {
    const header = [
        'Journal Date',
        'Reference Number',
        'Journal Number',
        'Notes',
        'Account',
        'Contact Name',
        'Debit',
        'Credit',
        'Currency',
    ].join(',');

    const lines: string[] = [header];

    payments.forEach((p, idx) => {
        const dateStr = formatIsoDate(p.paidAt);
        const ref = p.providerReference || p.invoiceNumber;
        const journalNo = `SM-RCPT-${String(idx + 1).padStart(4, '0')}-${p.id.slice(0, 6).toUpperCase()}`;
        const notes = `Fee Receipt ${p.studentName} (${p.admissionNumber}) · ${p.invoiceNumber}`;
        const debitLedger = resolveTargetLedgerName(p.method, config);
        const creditLedger = `${config.receivableLedgerPrefix} - ${p.grade || 'General'}`;
        const amt = Number(p.amount || 0).toFixed(2);

        // Debit row (Bank / Cash / UPI Asset Account)
        lines.push(
            [
                dateStr,
                ref,
                journalNo,
                notes,
                debitLedger,
                p.studentName,
                amt,
                '0.00',
                'INR',
            ]
                .map(escapeCsvCell)
                .join(','),
        );

        // Credit row (Fee Income / Receivable Ledger)
        lines.push(
            [
                dateStr,
                ref,
                journalNo,
                notes,
                creditLedger,
                p.studentName,
                '0.00',
                amt,
                'INR',
            ]
                .map(escapeCsvCell)
                .join(','),
        );
    });

    return lines.join('\n');
}

/**
 * 3. Open-Source Frappe ERPNext (`frappe/erpnext`) Journal Entry JSON
 */
export function buildErpNextJson(
    payments: AccountingPaymentRow[],
    config: AccountingLedgerConfig,
): string {
    const entries = payments.map((p) => {
        const dateStr = formatIsoDate(p.paidAt);
        const amt = Number(Number(p.amount || 0).toFixed(2));
        const debitLedger = resolveTargetLedgerName(p.method, config);
        const creditLedger = `${config.receivableLedgerPrefix} - ${p.grade || 'General'}`;
        const isCash = String(p.method || '').toUpperCase() === 'CASH';

        return {
            doctype: 'Journal Entry',
            voucher_type: isCash ? 'Cash Entry' : 'Bank Entry',
            company: config.tallyCompanyName,
            posting_date: dateStr,
            cheque_no: p.providerReference || p.invoiceNumber,
            cheque_date: dateStr,
            custom_external_id: `scholarmind-${p.id}`,
            user_remark: `Fee Receipt - ${p.studentName} (${p.admissionNumber}) - Invoice #${p.invoiceNumber}`,
            accounts: [
                {
                    account: debitLedger,
                    debit_in_account_currency: amt,
                    credit_in_account_currency: 0,
                },
                {
                    account: creditLedger,
                    party_type: 'Student',
                    party: p.admissionNumber,
                    debit_in_account_currency: 0,
                    credit_in_account_currency: amt,
                },
            ],
        };
    });

    return JSON.stringify(
        {
            schema: 'frappe.erpnext.journal_entry.v1',
            company: config.tallyCompanyName,
            exportedAt: new Date().toISOString(),
            voucherCount: entries.length,
            entries,
        },
        null,
        2,
    );
}

export function buildTallyLocalBridgeCommand(
    appOrigin: string,
    fromDate: string,
    toDate: string,
): string {
    const cleanOrigin = appOrigin.replace(/\/+$/, '');
    return [
        `# Free TallyPrime XML-over-HTTP Local Bridge (No Paid Connector Needed)`,
        `# 1. Open TallyPrime -> F1 (Help) -> Settings -> Connectivity -> Client/Server: Both, Port: 9000`,
        `curl -sS -X POST "${cleanOrigin}/api/integrations/tally/vouchers" \\`,
        `  -H "Authorization: Bearer $SCHOLARMIND_TALLY_API_KEY" \\`,
        `  -H "Content-Type: application/json" \\`,
        `  -d '{"fromDate":"${fromDate}","toDate":"${toDate}","format":"tally_xml"}' \\`,
        `  | curl -sS -X POST "http://localhost:9000" -H "Content-Type: text/xml" --data-binary @-`,
    ].join('\n');
}
