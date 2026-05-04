import type { Prisma } from '@prisma/client';

export type InvoiceMoneyRow = {
  amount: Prisma.Decimal;
  currency: string;
  payments: Array<{ amount: Prisma.Decimal }>;
};

export type ResolvedProjectMoney = {
  value: number | null;
  paidAmount: number | null;
  currency: string;
  /** Invoices use more than one currency. */
  mixedCurrency: boolean;
};

/**
 * Manual DB fields, else invoice / payment sums.
 * Primary currency = first invoice's currency (by query order).
 */
export function resolveProjectMoney(
  dbValue: Prisma.Decimal | null | undefined,
  dbPaid: Prisma.Decimal | null | undefined,
  invoices: InvoiceMoneyRow[],
): ResolvedProjectMoney {
  const currencies = new Set(
    invoices.map((i) => (i.currency || 'EUR').toUpperCase()),
  );
  const mixedCurrency = currencies.size > 1;

  const primary =
    invoices.length > 0
      ? (invoices[0].currency || 'EUR').toUpperCase()
      : 'EUR';
  const sameCurrency =
    invoices.length === 0 ||
    invoices.every(
      (i) => (i.currency || 'EUR').toUpperCase() === primary,
    );

  let value: number | null = dbValue != null ? Number(dbValue) : null;
  if (value == null && invoices.length > 0 && sameCurrency) {
    value = invoices.reduce((s, i) => s + Number(i.amount), 0);
  }

  let paidSum = 0;
  let anyPayment = false;
  for (const inv of invoices) {
    if ((inv.currency || 'EUR').toUpperCase() !== primary) continue;
    for (const pay of inv.payments) {
      paidSum += Number(pay.amount);
      anyPayment = true;
    }
  }
  if (!anyPayment && dbPaid != null) {
    paidSum = Number(dbPaid);
    anyPayment = true;
  }

  return {
    value,
    paidAmount: anyPayment ? paidSum : null,
    currency: primary,
    mixedCurrency,
  };
}
