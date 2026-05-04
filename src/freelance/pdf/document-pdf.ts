import * as http from 'http';
import * as https from 'https';

import PDFDocument from 'pdfkit';

export type PdfBranding = {
  name: string | null;
  logoUrl: string | null;
  address: string | null;
  accentHex: string;
  footer: string | null;
};

function rgbFromHex(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '').trim();
  if (h.length === 6 && /^[0-9a-fA-F]{6}$/.test(h)) {
    return {
      r: Number.parseInt(h.slice(0, 2), 16),
      g: Number.parseInt(h.slice(2, 4), 16),
      b: Number.parseInt(h.slice(4, 6), 16),
    };
  }
  return { r: 99, g: 102, b: 241 };
}

function fmtMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency.trim().toUpperCase(),
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

async function fetchUrlBuffer(url: string, maxBytes = 2_000_000, redirectCount = 0): Promise<Buffer | null> {
  // Prevent infinite redirect loops
  if (redirectCount > 5) {
    return null;
  }

  return new Promise((resolve) => {
    let req: any = null;
    let isResolved = false;

    const cleanupAndResolve = (result: Buffer | null) => {
      if (isResolved) return;
      isResolved = true;
      if (req && !req.destroyed) {
        req.destroy();
      }
      resolve(result);
    };

    try {
      const u = new URL(url.trim());
      if (u.protocol !== 'https:' && u.protocol !== 'http:') {
        cleanupAndResolve(null);
        return;
      }
      const lib = u.protocol === 'https:' ? https : http;
      req = lib.get(url, (res) => {
        const code = res.statusCode ?? 0;
        if (code >= 300 && code < 400 && res.headers.location) {
          try {
            const next = new URL(res.headers.location, u).toString();
            res.resume();
            // Recursive call with redirect count tracking
            void fetchUrlBuffer(next, maxBytes, redirectCount + 1).then(cleanupAndResolve);
            return;
          } catch {
            cleanupAndResolve(null);
            return;
          }
        }
        if (code < 200 || code >= 300) {
          res.resume();
          cleanupAndResolve(null);
          return;
        }
        const chunks: Buffer[] = [];
        let total = 0;
        
        res.on('data', (chunk: Buffer) => {
          if (isResolved) return;
          total += chunk.length;
          if (total > maxBytes) {
            cleanupAndResolve(null);
            return;
          }
          chunks.push(chunk);
        });
        
        res.on('end', () => {
          if (!isResolved) {
            try {
              cleanupAndResolve(Buffer.concat(chunks));
            } catch {
              cleanupAndResolve(null);
            }
          }
        });

        res.on('error', () => {
          cleanupAndResolve(null);
        });
      });
      
      req.on('error', () => {
        cleanupAndResolve(null);
      });
      
      req.setTimeout(12_000, () => {
        cleanupAndResolve(null);
      });
    } catch {
      cleanupAndResolve(null);
    }
  });
}

function lineItemsRows(lineItems: unknown): { label: string; qty: string; amount: string }[] {
  if (!Array.isArray(lineItems)) return [];
  const out: { label: string; qty: string; amount: string }[] = [];
  for (const raw of lineItems) {
    if (!raw || typeof raw !== 'object') continue;
    const o = raw as Record<string, unknown>;
    const name =
      (typeof o.name === 'string' && o.name) ||
      (typeof o.description === 'string' && o.description) ||
      (typeof o.label === 'string' && o.label) ||
      'Item';
    const qty =
      typeof o.qty === 'number'
        ? String(o.qty)
        : typeof o.quantity === 'number'
          ? String(o.quantity)
          : typeof o.qty === 'string'
            ? o.qty
            : typeof o.quantity === 'string'
              ? o.quantity
              : '1';
    let amountCents: number | null = null;
    if (typeof o.amountCents === 'number') amountCents = o.amountCents;
    else if (typeof o.totalCents === 'number') amountCents = o.totalCents;
    else if (typeof o.unitCents === 'number' && typeof o.qty === 'number') {
      amountCents = Math.round(o.unitCents * o.qty);
    } else if (typeof o.unit === 'number' && typeof o.qty === 'number') {
      amountCents = Math.round(o.unit * 100 * o.qty);
    }
    const currency =
      typeof o.currency === 'string' ? o.currency : 'EUR';
    out.push({
      label: name,
      qty,
      amount: amountCents != null ? fmtMoney(amountCents, currency) : '—',
    });
  }
  return out;
}

export async function renderInvoicePdf(input: {
  branding: PdfBranding;
  invoiceNumber: string | null;
  memo: string | null;
  amountCents: number;
  currency: string;
  status: string;
  dueDate: string | null;
  createdAt: string;
  projectName: string;
  clientName: string;
  clientTaxId: string | null;
  lineItems: unknown;
  paidCents: number;
}): Promise<Buffer> {
  const accent = rgbFromHex(input.branding.accentHex ?? '#6366f1');
  const logoBuf = input.branding.logoUrl
    ? await fetchUrlBuffer(input.branding.logoUrl)
    : null;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c as Buffer));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    let y = doc.page.margins.top;

    doc
      .rect(doc.page.margins.left, y, w, 6)
      .fill(`rgb(${accent.r},${accent.g},${accent.b})`);
    y += 18;
    doc.fillColor('#111111');

    if (logoBuf) {
      try {
        doc.image(logoBuf, doc.page.margins.left, y, { width: 72, height: 72, fit: [72, 72] });
        y += 78;
      } catch {
        // unsupported image format
      }
    }

    doc.fontSize(22).font('Helvetica-Bold').fillColor('#111111');
    doc.text('INVOICE', doc.page.margins.left, y, { width: w });
    y = doc.y + 10;

    const leftX = doc.page.margins.left;

    const fromName = input.branding.name?.trim() || 'Freelancer';
    const fromAddr = input.branding.address?.trim() || '';

    doc.fontSize(10).font('Helvetica-Bold').fillColor('#111111').text('From', leftX, y, {
      width: w,
    });
    y = doc.y + 2;
    doc.fontSize(11).text(fromName, leftX, y, { width: w });
    y = doc.y + 2;
    if (fromAddr) {
      doc.font('Helvetica').fontSize(9).fillColor('#444444').text(fromAddr, leftX, y, {
        width: w,
      });
      y = doc.y + 8;
    } else {
      y += 8;
    }

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#111111').text('Bill to', leftX, y, {
      width: w,
    });
    y = doc.y + 2;
    doc.fontSize(11).text(input.clientName, leftX, y, { width: w });
    y = doc.y + 2;
    if (input.clientTaxId) {
      doc.font('Helvetica').fontSize(9).fillColor('#444444');
      doc.text(`Tax ID: ${input.clientTaxId}`, leftX, y, { width: w });
      y = doc.y + 8;
    } else {
      y += 8;
    }
    doc.fillColor('#111111');

    doc.font('Helvetica').fontSize(9);
    const metaLines = [
      `Invoice #: ${input.invoiceNumber ?? '—'}`,
      `Issue date: ${new Date(input.createdAt).toLocaleDateString()}`,
      `Due: ${input.dueDate ? new Date(input.dueDate).toLocaleDateString() : '—'}`,
      `Status: ${input.status}`,
      `Project: ${input.projectName}`,
    ];
    doc.text(metaLines.join('\n'), leftX, y, { width: w });
    y = doc.y + 12;

    doc.font('Helvetica-Bold').fontSize(10).text('Description', leftX, y);
    doc.text('Qty', leftX + w * 0.62, y, { width: w * 0.1, align: 'right' });
    doc.text('Amount', leftX + w * 0.72, y, { width: w * 0.28, align: 'right' });
    y = doc.y + 4;
    doc.moveTo(leftX, y).lineTo(leftX + w, y).strokeColor('#dddddd').lineWidth(0.5).stroke();
    y += 8;

    const rows = lineItemsRows(input.lineItems);
    doc.font('Helvetica').fontSize(9).fillColor('#222222');
    if (rows.length) {
      for (const r of rows) {
        doc.text(r.label, leftX, y, { width: w * 0.58 });
        const y0 = doc.y;
        doc.text(r.qty, leftX + w * 0.6, y, { width: w * 0.1, align: 'right' });
        doc.text(r.amount, leftX + w * 0.72, y, { width: w * 0.28, align: 'right' });
        y = Math.max(y0, doc.y) + 6;
      }
    } else {
      doc.text(input.memo?.trim() || 'Services', leftX, y, { width: w * 0.58 });
      doc.text('1', leftX + w * 0.6, y, { width: w * 0.1, align: 'right' });
      doc.text(
        fmtMoney(input.amountCents, input.currency),
        leftX + w * 0.72,
        y,
        { width: w * 0.28, align: 'right' },
      );
      y = doc.y + 10;
    }

    y += 8;
    doc.moveTo(leftX, y).lineTo(leftX + w, y).strokeColor('#dddddd').lineWidth(0.5).stroke();
    y += 10;

    doc.font('Helvetica-Bold').fontSize(11).fillColor('#111111');
    doc.text('Total', leftX, y, { width: w * 0.62, align: 'right' });
    doc.text(
      fmtMoney(input.amountCents, input.currency),
      leftX + w * 0.62,
      y,
      { width: w * 0.38, align: 'right' },
    );
    y = doc.y + 8;

    if (input.paidCents > 0) {
      doc.font('Helvetica').fontSize(9).fillColor('#444444');
      doc.text(
        `Recorded payments: ${fmtMoney(input.paidCents, input.currency)}`,
        leftX,
        y,
        { width: w, align: 'right' },
      );
      y = doc.y + 6;
    }

    if (input.branding.footer?.trim()) {
      y += 12;
      doc.font('Helvetica').fontSize(8).fillColor('#666666');
      doc.text(input.branding.footer.trim(), leftX, y, { width: w, align: 'left' });
    }

    doc.end();
  });
}

export async function renderQuotePdf(input: {
  branding: PdfBranding;
  title: string;
  amountCents: number;
  currency: string;
  status: string;
  validUntil: string | null;
  scopeNotes: string | null;
  createdAt: string;
  clientName: string;
}): Promise<Buffer> {
  const accent = rgbFromHex(input.branding.accentHex ?? '#6366f1');
  const logoBuf = input.branding.logoUrl
    ? await fetchUrlBuffer(input.branding.logoUrl)
    : null;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c as Buffer));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    let y = doc.page.margins.top;

    doc
      .rect(doc.page.margins.left, y, w, 6)
      .fill(`rgb(${accent.r},${accent.g},${accent.b})`);
    y += 18;
    doc.fillColor('#111111');

    if (logoBuf) {
      try {
        doc.image(logoBuf, doc.page.margins.left, y, { width: 72, height: 72, fit: [72, 72] });
        y += 78;
      } catch {
        // ignore
      }
    }

    doc.fontSize(22).font('Helvetica-Bold').fillColor('#111111');
    doc.text('QUOTE / ESTIMATE', doc.page.margins.left, y, { width: w });
    y = doc.y + 10;

    const leftX = doc.page.margins.left;

    const fromName = input.branding.name?.trim() || 'Freelancer';
    const fromAddr = input.branding.address?.trim() || '';

    doc.fontSize(10).font('Helvetica-Bold').fillColor('#111111').text('From', leftX, y, {
      width: w,
    });
    y = doc.y + 2;
    doc.fontSize(11).text(fromName, leftX, y, { width: w });
    y = doc.y + 2;
    if (fromAddr) {
      doc.font('Helvetica').fontSize(9).fillColor('#444444').text(fromAddr, leftX, y, {
        width: w,
      });
      y = doc.y + 8;
    } else {
      y += 8;
    }

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#111111').text('For', leftX, y, {
      width: w,
    });
    y = doc.y + 2;
    doc.fontSize(11).text(input.clientName, leftX, y, { width: w });
    y = doc.y + 12;
    doc.fillColor('#111111');

    doc.font('Helvetica').fontSize(10);
    doc.text(`Title: ${input.title}`, leftX, y, { width: w });
    y = doc.y + 4;
    doc.text(`Amount: ${fmtMoney(input.amountCents, input.currency)}`, leftX, y, { width: w });
    y = doc.y + 4;
    doc.text(`Status: ${input.status}`, leftX, y, { width: w });
    y = doc.y + 4;
    doc.text(`Created: ${new Date(input.createdAt).toLocaleDateString()}`, leftX, y, {
      width: w,
    });
    y = doc.y + 4;
    doc.text(
      `Valid until: ${input.validUntil ? new Date(input.validUntil).toLocaleDateString() : '—'}`,
      leftX,
      y,
      { width: w },
    );
    y = doc.y + 12;

    if (input.scopeNotes?.trim()) {
      doc.font('Helvetica-Bold').fontSize(10).text('Scope / notes', leftX, y, { width: w });
      y = doc.y + 4;
      doc.font('Helvetica').fontSize(9).fillColor('#333333');
      doc.text(input.scopeNotes.trim(), leftX, y, { width: w, align: 'left' });
      y = doc.y + 8;
    }

    if (input.branding.footer?.trim()) {
      y += 8;
      doc.font('Helvetica').fontSize(8).fillColor('#666666');
      doc.text(input.branding.footer.trim(), leftX, y, { width: w, align: 'left' });
    }

    doc.end();
  });
}
