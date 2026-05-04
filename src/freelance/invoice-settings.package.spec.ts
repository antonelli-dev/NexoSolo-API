import {
  consumeNextInvoiceNumber,
  mergeInvoiceDocumentTemplate,
  peekNextInvoiceNumber,
  parseTaxBreakdownLines,
} from '@rizzup/invoice-settings';

/** Locks shared package behaviour so RizzUpApp preview matches RizzUpBE persistence. */
describe('@rizzup/invoice-settings', () => {
  const mid2026 = new Date('2026-06-15T12:00:00.000Z');

  it('peek auto default is 1', () => {
    expect(peekNextInvoiceNumber(null, mid2026)).toBe('1');
  });

  it('peek manual is null', () => {
    expect(peekNextInvoiceNumber({ mode: 'manual', nextSequence: 5 }, mid2026)).toBeNull();
  });

  it('peek prefix + year + padding', () => {
    expect(
      peekNextInvoiceNumber(
        {
          mode: 'auto',
          prefix: 'INV-',
          suffix: '',
          padLength: 4,
          includeYearInNumber: true,
          resetCounterEachYear: false,
          nextSequence: 42,
          sequenceYear: null,
        },
        mid2026,
      ),
    ).toBe('INV-2026-0042');
  });

  it('consume increments nextSequence', () => {
    const r = consumeNextInvoiceNumber(null, mid2026);
    expect(r?.invoiceNumber).toBe('1');
    expect(r?.updatedState.nextSequence).toBe(2);
  });

  it('yearly reset uses 1 in new year', () => {
    const raw = {
      mode: 'auto' as const,
      prefix: '',
      suffix: '',
      padLength: 0,
      includeYearInNumber: false,
      resetCounterEachYear: true,
      nextSequence: 99,
      sequenceYear: 2025,
    };
    const d2027 = new Date('2027-01-02T12:00:00.000Z');
    expect(peekNextInvoiceNumber(raw, d2027)).toBe('1');
  });

  it('mergeInvoiceDocumentTemplate fills defaults', () => {
    const m = mergeInvoiceDocumentTemplate(null);
    expect(m.showIssuerTaxId).toBe(true);
    expect(m.labels.taxBreakdown).toBe('Tax summary');
  });

  it('parseTaxBreakdownLines', () => {
    expect(parseTaxBreakdownLines([{ label: 'VAT', amountCents: 100, ratePercent: 21 }])).toEqual(
      [{ label: 'VAT', amountCents: 100, ratePercent: 21 }],
    );
  });
});
