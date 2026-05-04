import {
  normalizeInvoicePdfLocale,
  parseInvoiceLineItems,
  signInvoicePdfDownloadToken,
  verifyInvoicePdfDownloadToken,
} from './invoice-pdf';

describe('invoice-pdf', () => {
  it('normalizeInvoicePdfLocale', () => {
    expect(normalizeInvoicePdfLocale(undefined)).toBe('en');
    expect(normalizeInvoicePdfLocale('ES')).toBe('es');
    expect(normalizeInvoicePdfLocale('es-MX')).toBe('es');
    expect(normalizeInvoicePdfLocale('de')).toBe('en');
  });

  it('parseInvoiceLineItems handles common shapes', () => {
    expect(parseInvoiceLineItems(null)).toEqual([]);
    expect(
      parseInvoiceLineItems([
        { description: 'Copy', quantity: 1, amount: 100 },
        { title: 'Edit', unitPrice: 50, lineTotal: 50 },
      ]),
    ).toEqual([
      expect.objectContaining({ description: 'Copy', lineTotal: 100 }),
      expect.objectContaining({ description: 'Edit', unitAmount: 50, lineTotal: 50 }),
    ]);
  });

  it('sign and verify download token', () => {
    const secret = 'test-secret-for-jwt';
    const token = signInvoicePdfDownloadToken(
      {
        invoiceId: '11111111-1111-1111-1111-111111111111',
        clientId: '22222222-2222-2222-2222-222222222222',
        freelancerId: '33333333-3333-3333-3333-333333333333',
      },
      secret,
      120,
    );
    const payload = verifyInvoicePdfDownloadToken(token, secret);
    expect(payload.invoiceId).toBe('11111111-1111-1111-1111-111111111111');
    expect(payload.clientId).toBe('22222222-2222-2222-2222-222222222222');
  });
});
