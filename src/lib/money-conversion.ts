import { Decimal } from '@prisma/client/runtime/library';

/**
 * Centralised money conversion utilities to prevent floating point errors.
 * All monetary calculations should use these helpers to maintain precision.
 */

/**
 * Converts a Decimal amount (in currency units) to cents (integers).
 * Example: EUR 12.34 → 1234 cents
 *
 * @param decimal - The amount in decimal format (from Prisma or input)
 * @returns The amount in cents as an integer
 */
export function decimalToCents(decimal: Decimal | null | undefined | string | number): number {
  // Only null/undefined short-circuit; NaN is falsy but must throw (see tests).
  if (decimal == null) return 0;

  // Convert to string to handle all types safely
  const str = String(decimal);

  // Parse and multiply by 100
  const parsed = parseFloat(str);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid amount: ${decimal}`);
  }

  // Round to nearest cent to avoid floating point errors
  return Math.round(parsed * 100);
}

/**
 * Converts cents (integers) to a Decimal amount (in currency units).
 * Example: 1234 cents → Decimal(12.34)
 *
 * @param cents - The amount in cents
 * @returns The amount as a Decimal
 */
export function centsToDec(cents: number | null | undefined): Decimal {
  if (cents == null) return new Decimal(0);
  if (!Number.isFinite(cents)) {
    throw new Error(`Invalid cents: ${cents}`);
  }
  return new Decimal(cents).dividedBy(100);
}

/**
 * Validates that an amount is within acceptable bounds.
 * Maximum: 9,999,999.99 (9.9 million per transaction - reasonable limit)
 *
 * @param cents - The amount in cents
 * @returns true if valid, false otherwise
 */
export function isValidAmount(cents: number): boolean {
  const MIN_CENTS = 0; // No negative amounts
  const MAX_CENTS = 999_999_999; // 9,999,999.99

  return Number.isInteger(cents) && cents >= MIN_CENTS && cents <= MAX_CENTS;
}

/**
 * Formats cents to a human-readable string with currency symbol.
 * Example: 1234 cents → "$12.34"
 *
 * @param cents - The amount in cents
 * @param currency - ISO 4217 currency code (default: "USD")
 * @returns Formatted string
 */
export function formatCents(cents: number, currency: string = 'USD'): string {
  const amount = (cents / 100).toFixed(2);
  const symbols: Record<string, string> = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
    AUD: 'A$',
    CAD: 'C$',
    CHF: 'CHF',
    RUB: '₽',
  };
  const symbol = symbols[currency] || currency;
  return `${symbol}${amount}`;
}

/**
 * List of supported currencies (ISO 4217 codes)
 */
export const SUPPORTED_CURRENCIES = [
  'EUR',
  'USD',
  'GBP',
  'AUD',
  'CAD',
  'CHF',
  'JPY',
  'RUB',
  'INR',
  'MXN',
  'BRL',
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/**
 * Validates that a currency is supported
 */
export function isSupportedCurrency(currency: unknown): currency is SupportedCurrency {
  return typeof currency === 'string' && SUPPORTED_CURRENCIES.includes(currency as SupportedCurrency);
}
