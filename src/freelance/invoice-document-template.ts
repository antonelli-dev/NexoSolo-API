/**
 * Visibility + labels for invoice PDF/HTML. User configures; app only renders.
 */
export type InvoiceDocumentTemplate = {
  showIssuerTaxId: boolean;
  showIssuerAddress: boolean;
  showClientTaxId: boolean;
  showTaxBreakdown: boolean;
  showLegalFooter: boolean;
  showInvoiceNotes: boolean;
  labels: {
    issuerTaxId: string;
    clientTaxId: string;
    taxBreakdown: string;
    legalFooter: string;
    invoiceNotes: string;
  };
};

export const DEFAULT_INVOICE_DOCUMENT_TEMPLATE: InvoiceDocumentTemplate = {
  showIssuerTaxId: true,
  showIssuerAddress: true,
  showClientTaxId: true,
  showTaxBreakdown: true,
  showLegalFooter: true,
  showInvoiceNotes: true,
  labels: {
    issuerTaxId: 'Tax ID',
    clientTaxId: 'Tax ID',
    taxBreakdown: 'Tax summary',
    legalFooter: 'Legal',
    invoiceNotes: 'Notes',
  },
};

export function mergeInvoiceDocumentTemplate(raw: unknown): InvoiceDocumentTemplate {
  const d = DEFAULT_INVOICE_DOCUMENT_TEMPLATE;
  const out: InvoiceDocumentTemplate = {
    showIssuerTaxId: d.showIssuerTaxId,
    showIssuerAddress: d.showIssuerAddress,
    showClientTaxId: d.showClientTaxId,
    showTaxBreakdown: d.showTaxBreakdown,
    showLegalFooter: d.showLegalFooter,
    showInvoiceNotes: d.showInvoiceNotes,
    labels: { ...d.labels },
  };

  if (raw === null || raw === undefined) return out;
  if (typeof raw !== 'object' || Array.isArray(raw)) return out;
  const o = raw as Record<string, unknown>;

  for (const k of [
    'showIssuerTaxId',
    'showIssuerAddress',
    'showClientTaxId',
    'showTaxBreakdown',
    'showLegalFooter',
    'showInvoiceNotes',
  ] as const) {
    if (typeof o[k] === 'boolean') out[k] = o[k];
  }

  if (o.labels && typeof o.labels === 'object' && !Array.isArray(o.labels)) {
    const L = o.labels as Record<string, unknown>;
    const max = 40;
    if (typeof L.issuerTaxId === 'string') out.labels.issuerTaxId = L.issuerTaxId.slice(0, max);
    if (typeof L.clientTaxId === 'string') out.labels.clientTaxId = L.clientTaxId.slice(0, max);
    if (typeof L.taxBreakdown === 'string') out.labels.taxBreakdown = L.taxBreakdown.slice(0, max);
    if (typeof L.legalFooter === 'string') out.labels.legalFooter = L.legalFooter.slice(0, max);
    if (typeof L.invoiceNotes === 'string') out.labels.invoiceNotes = L.invoiceNotes.slice(0, max);
  }

  return out;
}

export type ProfilePdfSlice = {
  invoiceBrandName: string | null;
  invoiceBrandAddress: string | null;
  invoiceBrandFooter: string | null;
  invoiceIssuerTaxId: string | null;
  invoiceDocumentTemplate: unknown;
};

export function profileSliceForPdf(p: ProfilePdfSlice) {
  return {
    issuerName: p.invoiceBrandName,
    issuerAddress: p.invoiceBrandAddress,
    issuerTaxId: p.invoiceIssuerTaxId,
    footerText: p.invoiceBrandFooter,
    template: mergeInvoiceDocumentTemplate(p.invoiceDocumentTemplate),
  };
}

/** Parse tax_breakdown JSON from DB: array of { label, amountCents?, ratePercent? }. */
export function parseTaxBreakdownLines(raw: unknown): Array<{
  label: string;
  amountCents?: number | null;
  ratePercent?: number | null;
}> {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return [];
  const out: Array<{
    label: string;
    amountCents?: number | null;
    ratePercent?: number | null;
  }> = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const label = typeof r.label === 'string' ? r.label.trim().slice(0, 200) : '';
    if (!label) continue;
    let amountCents: number | null | undefined;
    if (typeof r.amountCents === 'number') amountCents = Math.round(r.amountCents);
    else if (typeof r.amountCents === 'string') {
      const n = parseInt(r.amountCents, 10);
      amountCents = Number.isFinite(n) ? n : undefined;
    }
    let ratePercent: number | null | undefined;
    if (typeof r.ratePercent === 'number') ratePercent = r.ratePercent;
    out.push({ label, amountCents: amountCents ?? null, ratePercent });
  }
  return out;
}
