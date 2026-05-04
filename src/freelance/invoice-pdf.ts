import * as jwt from 'jsonwebtoken';
import PDFDocument from 'pdfkit';

import {
  DEFAULT_INVOICE_DOCUMENT_TEMPLATE,
  mergeInvoiceDocumentTemplate,
  parseTaxBreakdownLines,
  type InvoiceDocumentTemplate,
  type ProfilePdfSlice,
  profileSliceForPdf,
} from '@rizzup/invoice-settings';

export type InvoicePdfLocale = 'en' | 'es';

export type InvoicePdfLineItem = {
  description: string;
  quantity?: number;
  unitAmount?: number;
  lineTotal?: number;
};

export type InvoicePdfTaxLine = {
  label: string;
  amountCents?: number | null;
  ratePercent?: number | null;
};

export type InvoicePdfInput = {
  invoiceNumber: string | null;
  currency: string;
  amountMajor: number;
  status: string;
  issuedAt: Date;
  dueDate: Date | null;
  memo: string | null;
  projectName: string;
  clientName: string;
  clientEmail?: string | null;
  clientTaxId?: string | null;
  lineItems: InvoicePdfLineItem[];
  payments: Array<{ amountMajor: number; createdAt: Date; note: string | null }>;
  issuerName?: string | null;
  issuerAddress?: string | null;
  issuerTaxId?: string | null;
  footerText?: string | null;
  documentTemplate?: InvoiceDocumentTemplate;
  taxBreakdownLines?: InvoicePdfTaxLine[];
};

export const INVOICE_PDF_DOWNLOAD_PURPOSE = 'invoice_pdf' as const;

export type InvoicePdfDownloadJwtPayload = {
  purpose: typeof INVOICE_PDF_DOWNLOAD_PURPOSE;
  invoiceId: string;
  clientId: string;
  freelancerId: string;
};

export const LABELS: Record<
  InvoicePdfLocale,
  {
    title: string;
    invoiceNo: string;
    date: string;
    due: string;
    from: string;
    client: string;
    project: string;
    status: string;
    amount: string;
    lines: string;
    payments: string;
    memo: string;
    page: string;
  }
> = {
  en: {
    title: 'Invoice',
    invoiceNo: 'Invoice no.',
    date: 'Issue date',
    due: 'Due date',
    from: 'From',
    client: 'Bill to',
    project: 'Project',
    status: 'Status',
    amount: 'Amount due',
    lines: 'Line items',
    payments: 'Payments recorded',
    memo: 'Notes',
    page: 'Page',
  },
  es: {
    title: 'Factura',
    invoiceNo: 'Nº factura',
    date: 'Fecha',
    due: 'Vencimiento',
    from: 'Emisor',
    client: 'Cliente',
    project: 'Proyecto',
    status: 'Estado',
    amount: 'Importe',
    lines: 'Conceptos',
    payments: 'Pagos registrados',
    memo: 'Notas',
    page: 'Página',
  },
};

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

function fmtMoneyCents(cents: number, currency: string): string {
  return fmtMoney(cents / 100, currency);
}

function fmtDate(d: Date | null, locale: InvoicePdfLocale): string {
  if (!d) return '—';
  const lng = locale === 'es' ? 'es-ES' : 'en-GB';
  return d.toLocaleDateString(lng, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function parseInvoiceLineItems(raw: unknown): InvoicePdfLineItem[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return [];
  const out: InvoicePdfLineItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const desc =
      (typeof o.description === 'string' && o.description) ||
      (typeof o.title === 'string' && o.title) ||
      (typeof o.label === 'string' && o.label) ||
      '';
    const qty = typeof o.quantity === 'number' ? o.quantity : Number(o.quantity);
    const unit =
      typeof o.unitPrice === 'number'
        ? o.unitPrice
        : typeof o.unitAmount === 'number'
          ? o.unitAmount
          : Number(o.unitPrice ?? o.unitAmount ?? NaN);
    const total =
      typeof o.amount === 'number'
        ? o.amount
        : typeof o.lineTotal === 'number'
          ? o.lineTotal
          : Number(o.amount ?? o.lineTotal ?? NaN);
    out.push({
      description: desc || '—',
      quantity: Number.isFinite(qty) ? qty : undefined,
      unitAmount: Number.isFinite(unit) ? unit : undefined,
      lineTotal: Number.isFinite(total) ? total : undefined,
    });
  }
  return out;
}

export function normalizeInvoicePdfLocale(raw: string | undefined): InvoicePdfLocale {
  const s = (raw ?? 'en').toLowerCase().slice(0, 2);
  return s === 'es' ? 'es' : 'en';
}

export function buildInvoicePdfBuffer(
  input: InvoicePdfInput,
  locale: InvoicePdfLocale = 'en',
): Promise<Buffer> {
  const L = LABELS[locale];
  const tmpl = input.documentTemplate ?? DEFAULT_INVOICE_DOCUMENT_TEMPLATE;
  const taxLines = input.taxBreakdownLines ?? [];

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).text(L.title, { continued: false });
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor('#444444');
    const invNo = input.invoiceNumber ?? '—';
    doc.text(`${L.invoiceNo}: ${invNo}`);
    doc.text(`${L.date}: ${fmtDate(input.issuedAt, locale)}`);
    doc.text(`${L.due}: ${fmtDate(input.dueDate, locale)}`);
    doc.moveDown();

    const fromLines: string[] = [];
    const name = input.issuerName?.trim();
    if (name) fromLines.push(name);
    if (tmpl.showIssuerAddress) {
      const addr = input.issuerAddress?.trim();
      if (addr) fromLines.push(addr);
    }
    if (tmpl.showIssuerTaxId) {
      const tid = input.issuerTaxId?.trim();
      if (tid) fromLines.push(`${tmpl.labels.issuerTaxId}: ${tid}`);
    }
    if (fromLines.length > 0) {
      doc.fillColor('#000000').fontSize(11).text(L.from, { underline: false });
      doc.fontSize(10).fillColor('#333333');
      for (const line of fromLines) doc.text(line, { width: 500 });
      doc.moveDown(0.5);
    }

    doc.fillColor('#000000').fontSize(11).text(`${L.client}: ${input.clientName}`);
    if (input.clientEmail) doc.fontSize(10).fillColor('#555555').text(input.clientEmail);
    if (tmpl.showClientTaxId) {
      const ct = input.clientTaxId?.trim();
      if (ct) {
        doc.fontSize(10).fillColor('#333333').text(`${tmpl.labels.clientTaxId}: ${ct}`);
      }
    }
    doc.fillColor('#000000').fontSize(11).text(`${L.project}: ${input.projectName}`);
    doc.text(`${L.status}: ${input.status}`);
    doc.moveDown();
    doc.fontSize(14).text(`${L.amount}: ${fmtMoney(input.amountMajor, input.currency)}`, {
      underline: false,
    });
    doc.moveDown();

    if (input.lineItems.length > 0) {
      doc.fontSize(12).fillColor('#111111').text(L.lines);
      doc.moveDown(0.25);
      doc.fontSize(9).fillColor('#333333');
      for (const line of input.lineItems) {
        const parts = [line.description];
        if (line.quantity != null) parts.push(`×${line.quantity}`);
        if (line.unitAmount != null) parts.push(`@ ${fmtMoney(line.unitAmount, input.currency)}`);
        if (line.lineTotal != null) parts.push(`= ${fmtMoney(line.lineTotal, input.currency)}`);
        doc.text(parts.join(' '), { width: 500 });
      }
      doc.moveDown();
    }

    if (tmpl.showTaxBreakdown && taxLines.length > 0) {
      doc.fontSize(12).fillColor('#111111').text(tmpl.labels.taxBreakdown);
      doc.moveDown(0.25);
      doc.fontSize(9).fillColor('#333333');
      for (const t of taxLines) {
        const rate =
          t.ratePercent != null && Number.isFinite(t.ratePercent)
            ? ` (${t.ratePercent}%)`
            : '';
        const amt =
          t.amountCents != null && Number.isFinite(t.amountCents)
            ? ` — ${fmtMoneyCents(t.amountCents, input.currency)}`
            : '';
        doc.text(`${t.label}${rate}${amt}`, { width: 500 });
      }
      doc.moveDown();
    }

    if (input.payments.length > 0) {
      doc.fontSize(12).fillColor('#111111').text(L.payments);
      doc.moveDown(0.25);
      doc.fontSize(9).fillColor('#333333');
      for (const p of input.payments) {
        const note = p.note ? ` — ${p.note}` : '';
        doc.text(
          `${fmtDate(p.createdAt, locale)} · ${fmtMoney(p.amountMajor, input.currency)}${note}`,
        );
      }
      doc.moveDown();
    }

    if (tmpl.showInvoiceNotes && input.memo?.trim()) {
      doc.fontSize(11).fillColor('#111111').text(tmpl.labels.invoiceNotes);
      doc.fontSize(9).fillColor('#444444').text(input.memo.trim(), { width: 500 });
      doc.moveDown();
    }

    if (tmpl.showLegalFooter && input.footerText?.trim()) {
      doc.fontSize(10).fillColor('#444444').text(tmpl.labels.legalFooter, { underline: false });
      doc.fontSize(8).fillColor('#666666').text(input.footerText.trim(), { width: 500 });
    }

    doc.fontSize(8).fillColor('#888888').text(`${L.page} 1`, 48, doc.page.height - 60, {
      lineBreak: false,
    });

    doc.end();
  });
}

export function signInvoicePdfDownloadToken(
  payload: Omit<InvoicePdfDownloadJwtPayload, 'purpose'>,
  secret: string,
  expiresInSeconds = 1800,
): string {
  const body: InvoicePdfDownloadJwtPayload = {
    purpose: INVOICE_PDF_DOWNLOAD_PURPOSE,
    ...payload,
  };
  return jwt.sign(body, secret, { expiresIn: expiresInSeconds });
}

export function verifyInvoicePdfDownloadToken(
  token: string,
  secret: string,
): InvoicePdfDownloadJwtPayload {
  const decoded = jwt.verify(token, secret) as jwt.JwtPayload & Partial<InvoicePdfDownloadJwtPayload>;
  if (decoded.purpose !== INVOICE_PDF_DOWNLOAD_PURPOSE) {
    throw new Error('INVALID_PDF_TOKEN');
  }
  if (!decoded.invoiceId || !decoded.clientId || !decoded.freelancerId) {
    throw new Error('INVALID_PDF_TOKEN');
  }
  return {
    purpose: INVOICE_PDF_DOWNLOAD_PURPOSE,
    invoiceId: decoded.invoiceId,
    clientId: decoded.clientId,
    freelancerId: decoded.freelancerId,
  };
}

/** Map Prisma invoice row + optional profile to PDF input. */
export function mapFreelanceInvoiceRowToPdfInput(
  inv: {
    invoiceNumber: string | null;
    currency: string;
    amount: unknown;
    status: string;
    createdAt: Date;
    dueDate: Date | null;
    memo: string | null;
    lineItems: unknown;
    taxBreakdown?: unknown | null;
    project: {
      name: string;
      client: { name: string; email: string | null; taxId?: string | null };
    };
    payments: Array<{ amount: unknown; createdAt: Date; note: string | null }>;
  },
  profile: ProfilePdfSlice | null,
): InvoicePdfInput {
  const pdfProfile = profile ? profileSliceForPdf(profile) : null;
  const tmpl = pdfProfile?.template ?? mergeInvoiceDocumentTemplate(null);

  return {
    invoiceNumber: inv.invoiceNumber,
    currency: inv.currency || 'EUR',
    amountMajor: Number(inv.amount),
    status: inv.status,
    issuedAt: inv.createdAt,
    dueDate: inv.dueDate,
    memo: inv.memo,
    projectName: inv.project.name,
    clientName: inv.project.client.name,
    clientEmail: inv.project.client.email,
    clientTaxId: inv.project.client.taxId ?? null,
    lineItems: parseInvoiceLineItems(inv.lineItems),
    payments: inv.payments.map((p) => ({
      amountMajor: Number(p.amount),
      createdAt: p.createdAt,
      note: p.note,
    })),
    issuerName: pdfProfile?.issuerName ?? null,
    issuerAddress: pdfProfile?.issuerAddress ?? null,
    issuerTaxId: pdfProfile?.issuerTaxId ?? null,
    footerText: pdfProfile?.footerText ?? null,
    documentTemplate: tmpl,
    taxBreakdownLines: parseTaxBreakdownLines(inv.taxBreakdown ?? null),
  };
}
