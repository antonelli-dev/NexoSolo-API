import { Prisma } from '@prisma/client';

import { resolveProjectMoney } from './project-money.util';

describe('resolveProjectMoney', () => {
  it('sums invoices in one currency when no stored value', () => {
    const r = resolveProjectMoney(null, null, [
      { amount: new Prisma.Decimal(100), currency: 'EUR', payments: [] },
      { amount: new Prisma.Decimal(50.5), currency: 'EUR', payments: [] },
    ]);
    expect(r.value).toBe(150.5);
    expect(r.currency).toBe('EUR');
    expect(r.mixedCurrency).toBe(false);
    expect(r.paidAmount).toBeNull();
  });

  it('detects mixed invoice currencies', () => {
    const r = resolveProjectMoney(null, null, [
      { amount: new Prisma.Decimal(100), currency: 'EUR', payments: [] },
      { amount: new Prisma.Decimal(50), currency: 'USD', payments: [] },
    ]);
    expect(r.mixedCurrency).toBe(true);
  });

  it('sums payments in primary currency', () => {
    const r = resolveProjectMoney(null, null, [
      {
        amount: new Prisma.Decimal(200),
        currency: 'EUR',
        payments: [{ amount: new Prisma.Decimal(25) }],
      },
    ]);
    expect(r.paidAmount).toBe(25);
    expect(r.value).toBe(200);
  });

  it('uses stored value over invoice sum when set', () => {
    const r = resolveProjectMoney(new Prisma.Decimal(999), null, [
      { amount: new Prisma.Decimal(100), currency: 'EUR', payments: [] },
    ]);
    expect(r.value).toBe(999);
  });
});
