import PDFDocument from 'pdfkit';

import { LABELS, type InvoicePdfLocale } from './invoice-pdf';

// Reuse invoice label block for shared keys — quote uses subset
const Q = {
  en: {
    title: 'Quote / Estimate',
    quoteRef: 'Reference',
    client: 'Client',
    amount: 'Amount',
    validUntil: 'Valid until',
    scope: 'Scope & notes',
    status: 'Status',
    page: 'Page',
  },
  es: {
    title: 'Presupuesto',
    quoteRef: 'Referencia',
    client: 'Cliente',
    amount: 'Importe',
    validUntil: 'Válido hasta',
    scope: 'Alcance y notas',
    status: 'Estado',
    page: 'Página',
  },
} as const;

function fmtMoney(major: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(major);
  } catch {
    return `${major.toFixed(2)} ${currency}`;
  }
}

function fmtDate(d: Date | null, locale: InvoicePdfLocale): string {
  if (!d) return '—';
  const lng = locale === 'es' ? 'es-ES' : 'en-GB';
  return d.toLocaleDateString(lng, { year: 'numeric', month: 'short', day: 'numeric' });
}

export type QuotePdfInput = {
  title: string;
  currency: string;
  amountMajor: number;
  status: string;
  validUntil: Date | null;
  scopeNotes: string | null;
  clientName: string;
  clientEmail?: string | null;
  createdAt: Date;
};

export function buildQuotePdfBuffer(
  input: QuotePdfInput,
  locale: InvoicePdfLocale = 'en',
): Promise<Buffer> {
  const L = Q[locale];

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).text(L.title);
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor('#444444');
    doc.text(`${L.quoteRef}: ${input.title}`);
    doc.text(`${LABELS[locale].date}: ${fmtDate(input.createdAt, locale)}`);
    doc.text(`${L.validUntil}: ${fmtDate(input.validUntil, locale)}`);
    doc.moveDown();
    doc.fillColor('#000000').fontSize(11).text(`${L.client}: ${input.clientName}`);
    if (input.clientEmail) {
      doc.fontSize(10).fillColor('#555555').text(input.clientEmail);
    }
    doc.fillColor('#000000').fontSize(11).text(`${L.status}: ${input.status}`);
    doc.moveDown();
    doc.fontSize(14).text(`${L.amount}: ${fmtMoney(input.amountMajor, input.currency)}`);
    doc.moveDown();
    if (input.scopeNotes?.trim()) {
      doc.fontSize(12).text(L.scope);
      doc.fontSize(9).fillColor('#333333').text(input.scopeNotes.trim(), { width: 500 });
    }
    doc.fontSize(8).fillColor('#888888').text(`${L.page} 1`, 48, doc.page.height - 60);
    doc.end();
  });
}
