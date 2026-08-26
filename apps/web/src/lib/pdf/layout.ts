import { jsPDF } from 'jspdf';
import { pdfText } from './format';

/**
 * A very small layout layer over jsPDF.
 *
 * jsPDF draws at absolute coordinates and knows nothing about flow, so this
 * class owns a vertical cursor, breaks pages before a block would overflow, and
 * exposes the handful of primitives the receipt and report card need. It is
 * deliberately not a general-purpose typesetter.
 */

export const PAGE_WIDTH = 595.28; // A4 at 72dpi
export const PAGE_HEIGHT = 841.89;
export const MARGIN = 42;
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

type Rgb = readonly [number, number, number];

export const INK: Rgb = [17, 24, 39];
export const MUTED: Rgb = [107, 114, 128];
export const RULE: Rgb = [209, 213, 219];
export const BAND: Rgb = [243, 244, 246];
export const WARN: Rgb = [180, 83, 9];
export const GOOD: Rgb = [21, 128, 61];

export type Align = 'left' | 'center' | 'right';

export type TextOptions = {
    size?: number;
    bold?: boolean;
    color?: Rgb;
    align?: Align;
    /** Extra space left below the block. */
    gap?: number;
    width?: number;
};

export type Field = { label: string; value: string };

export type TableColumn = {
    header: string;
    /** Share of the content width, 0..1. Shares are normalised on render. */
    width: number;
    align?: Align;
};

export type TableRow = {
    cells: string[];
    /** Small grey line printed under the first cell. */
    note?: string;
    emphasis?: boolean;
    band?: boolean;
};

export class PdfBuilder {
    readonly doc: jsPDF;
    private y = MARGIN;

    constructor(title: string, subject: string) {
        this.doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
        this.doc.setProperties({
            title: pdfText(title),
            subject: pdfText(subject),
            creator: 'ScholarMind',
        });
        this.doc.setFont('helvetica', 'normal');
    }

    get cursor(): number {
        return this.y;
    }

    private get bottom(): number {
        // Room reserved for the page footer.
        return PAGE_HEIGHT - MARGIN - 18;
    }

    private style(size: number, bold: boolean, color: Rgb): void {
        this.doc.setFont('helvetica', bold ? 'bold' : 'normal');
        this.doc.setFontSize(size);
        this.doc.setTextColor(color[0], color[1], color[2]);
    }

    /** Break to a new page when `height` would not fit below the cursor. */
    ensure(height: number): void {
        if (this.y + height <= this.bottom) return;
        this.doc.addPage();
        this.y = MARGIN;
    }

    space(amount: number): void {
        this.y += amount;
    }

    /** Wrapped body text. Returns the height consumed. */
    text(value: string, options: TextOptions = {}): number {
        const size = options.size ?? 10;
        const color = options.color ?? INK;
        const width = options.width ?? CONTENT_WIDTH;
        const lineHeight = size * 1.35;

        this.style(size, options.bold ?? false, color);
        const lines: string[] = this.doc.splitTextToSize(pdfText(value), width);
        const height = lines.length * lineHeight;
        this.ensure(height);

        const align = options.align ?? 'left';
        const x = align === 'center' ? MARGIN + width / 2 : align === 'right' ? MARGIN + width : MARGIN;
        this.doc.text(lines, x, this.y + size, { align, baseline: 'alphabetic' });

        this.y += height + (options.gap ?? 0);
        return height;
    }

    /** A screaming-small uppercase section label. */
    sectionLabel(value: string): void {
        this.text(value.toUpperCase(), { size: 8.5, bold: true, color: MUTED, gap: 4 });
    }

    rule(gapAbove = 8, gapBelow = 8): void {
        this.y += gapAbove;
        this.ensure(1);
        this.doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
        this.doc.setLineWidth(0.6);
        this.doc.line(MARGIN, this.y, MARGIN + CONTENT_WIDTH, this.y);
        this.y += gapBelow;
    }

    /**
     * Label-over-value pairs laid out in a fixed number of columns, which is how
     * the on-screen receipt and report card present identity details.
     */
    fieldGrid(fields: Field[], columns = 2): void {
        if (fields.length === 0) return;
        const columnWidth = CONTENT_WIDTH / columns;
        const cellWidth = columnWidth - 12;

        for (let index = 0; index < fields.length; index += columns) {
            const row = fields.slice(index, index + columns);

            const wrapped = row.map((field) => {
                this.style(10, true, INK);
                return this.doc.splitTextToSize(pdfText(field.value), cellWidth) as string[];
            });
            const valueLines = Math.max(1, ...wrapped.map((lines) => lines.length));
            const rowHeight = 12 + valueLines * 13 + 8;
            this.ensure(rowHeight);

            row.forEach((field, column) => {
                const x = MARGIN + column * columnWidth;
                this.style(7.5, false, MUTED);
                this.doc.text(pdfText(field.label.toUpperCase()), x, this.y + 8);
                this.style(10, true, INK);
                this.doc.text(wrapped[column], x, this.y + 21);
            });

            this.y += rowHeight;
        }
    }

    /** A bordered table with a banded header. */
    table(columns: TableColumn[], rows: TableRow[]): void {
        const totalShare = columns.reduce((sum, column) => sum + column.width, 0) || 1;
        const widths = columns.map((column) => (column.width / totalShare) * CONTENT_WIDTH);
        const offsets: number[] = [];
        widths.reduce((x, width, index) => {
            offsets[index] = x;
            return x + width;
        }, MARGIN);

        const cellPad = 6;
        const drawHeader = () => {
            const headerHeight = 20;
            this.ensure(headerHeight);
            this.doc.setFillColor(BAND[0], BAND[1], BAND[2]);
            this.doc.rect(MARGIN, this.y, CONTENT_WIDTH, headerHeight, 'F');
            columns.forEach((column, index) => {
                this.style(7.5, true, MUTED);
                const align = column.align ?? 'left';
                const x = align === 'right'
                    ? offsets[index] + widths[index] - cellPad
                    : align === 'center'
                        ? offsets[index] + widths[index] / 2
                        : offsets[index] + cellPad;
                this.doc.text(pdfText(column.header.toUpperCase()), x, this.y + 13, { align });
            });
            this.y += headerHeight;
        };

        drawHeader();

        for (const row of rows) {
            // splitTextToSize measures with whatever font is currently active, so
            // the exact style each string will be *drawn* in has to be selected
            // before it is wrapped — otherwise a row that follows a note (7.5pt)
            // is measured small and drawn wide, and overruns its column.
            this.style(9.5, row.emphasis ?? false, INK);
            const wrapped = row.cells.map((cell, index) =>
                this.doc.splitTextToSize(pdfText(cell), widths[index] - cellPad * 2) as string[],
            );

            let noteLines: string[] = [];
            if (row.note) {
                this.style(7.5, false, MUTED);
                noteLines = this.doc.splitTextToSize(pdfText(row.note), widths[0] - cellPad * 2) as string[];
            }
            const bodyLines = Math.max(1, ...wrapped.map((lines) => lines.length));
            const rowHeight = 8 + bodyLines * 12 + noteLines.length * 10 + 6;

            if (this.y + rowHeight > this.bottom) {
                this.doc.addPage();
                this.y = MARGIN;
                drawHeader();
            }

            if (row.band) {
                this.doc.setFillColor(BAND[0], BAND[1], BAND[2]);
                this.doc.rect(MARGIN, this.y, CONTENT_WIDTH, rowHeight, 'F');
            }

            this.doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
            this.doc.setLineWidth(0.4);
            this.doc.line(MARGIN, this.y, MARGIN + CONTENT_WIDTH, this.y);

            columns.forEach((column, index) => {
                this.style(9.5, row.emphasis ?? false, INK);
                const align = column.align ?? 'left';
                const x = align === 'right'
                    ? offsets[index] + widths[index] - cellPad
                    : align === 'center'
                        ? offsets[index] + widths[index] / 2
                        : offsets[index] + cellPad;
                this.doc.text(wrapped[index], x, this.y + 16, { align });
            });

            if (noteLines.length > 0) {
                this.style(7.5, false, MUTED);
                this.doc.text(noteLines, offsets[0] + cellPad, this.y + 16 + bodyLines * 12);
            }

            this.y += rowHeight;
        }

        this.doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
        this.doc.setLineWidth(0.4);
        this.doc.line(MARGIN, this.y, MARGIN + CONTENT_WIDTH, this.y);
        this.y += 2;
    }

    /** A short highlighted strip, used for warnings such as an unpaid payment. */
    banner(value: string, color: Rgb = WARN): void {
        const height = 20;
        this.ensure(height + 6);
        this.doc.setDrawColor(color[0], color[1], color[2]);
        this.doc.setLineWidth(0.6);
        this.doc.rect(MARGIN, this.y, CONTENT_WIDTH, height);
        this.style(9, true, color);
        this.doc.text(pdfText(value), MARGIN + 8, this.y + 13.5);
        this.y += height + 6;
    }

    /** The signature block every school document ends with. */
    signature(schoolName: string, note: string): void {
        this.ensure(70);
        this.style(7.5, false, MUTED);
        const noteLines = this.doc.splitTextToSize(pdfText(note), CONTENT_WIDTH * 0.55) as string[];
        this.doc.text(noteLines, MARGIN, this.y + 40);

        const lineRight = MARGIN + CONTENT_WIDTH;
        const lineLeft = lineRight - 160;
        this.doc.setDrawColor(150, 150, 150);
        this.doc.setLineWidth(0.6);
        this.doc.line(lineLeft, this.y + 38, lineRight, this.y + 38);
        this.style(8, false, MUTED);
        this.doc.text('For ' + pdfText(schoolName), (lineLeft + lineRight) / 2, this.y + 50, {
            align: 'center',
        });
        this.y += 62;
    }

    /** Stamp `Page n of m` on every page and hand back the finished bytes. */
    finish(footerNote: string): Uint8Array {
        const pages = this.doc.getNumberOfPages();
        for (let page = 1; page <= pages; page += 1) {
            this.doc.setPage(page);
            this.style(7.5, false, MUTED);
            this.doc.text(pdfText(footerNote), MARGIN, PAGE_HEIGHT - MARGIN + 6);
            this.doc.text(`Page ${page} of ${pages}`, MARGIN + CONTENT_WIDTH, PAGE_HEIGHT - MARGIN + 6, {
                align: 'right',
            });
        }
        return new Uint8Array(this.doc.output('arraybuffer'));
    }
}

/** School letterhead: name, postal address, contact line. */
export function drawLetterhead(
    builder: PdfBuilder,
    school: {
        name: string;
        addressLine: string;
        contactLine: string;
    },
): void {
    builder.text(school.name, { size: 17, bold: true, align: 'center', gap: 2 });
    if (school.addressLine) {
        builder.text(school.addressLine, { size: 9, color: MUTED, align: 'center', gap: 1 });
    }
    if (school.contactLine) {
        builder.text(school.contactLine, { size: 8, color: MUTED, align: 'center' });
    }
    builder.rule(8, 10);
}
