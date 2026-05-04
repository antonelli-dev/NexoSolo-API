import { Decimal } from '@prisma/client/runtime/library';
import {
  decimalToCents,
  centsToDec,
  isValidAmount,
  formatCents,
  SUPPORTED_CURRENCIES,
} from './money-conversion';

describe('Money Conversion Utilities', () => {
  describe('decimalToCents', () => {
    it('converts decimal to cents correctly', () => {
      expect(decimalToCents(12.34)).toBe(1234);
      expect(decimalToCents(0.99)).toBe(99);
      expect(decimalToCents(100)).toBe(10000);
    });

    it('handles Prisma Decimal objects', () => {
      expect(decimalToCents(new Decimal('12.34'))).toBe(1234);
      expect(decimalToCents(new Decimal('0.01'))).toBe(1);
    });

    it('handles string inputs', () => {
      expect(decimalToCents('12.34')).toBe(1234);
      expect(decimalToCents('99.99')).toBe(9999);
    });

    it('returns 0 for null/undefined', () => {
      expect(decimalToCents(null)).toBe(0);
      expect(decimalToCents(undefined)).toBe(0);
    });

    it('handles edge case: zero', () => {
      expect(decimalToCents(0)).toBe(0);
      expect(decimalToCents('0.00')).toBe(0);
    });

    it('handles edge case: large amounts', () => {
      expect(decimalToCents(9999999.99)).toBe(999999999);
    });

    it('throws on invalid input', () => {
      expect(() => decimalToCents(NaN)).toThrow('Invalid amount');
      expect(() => decimalToCents(Infinity)).toThrow('Invalid amount');
    });

    it('rounds floating point errors correctly', () => {
      // JavaScript floating point: 0.1 + 0.2 !== 0.3
      expect(decimalToCents(0.1 + 0.2)).toBe(30);
    });
  });

  describe('centsToDec', () => {
    it('converts cents to decimal correctly', () => {
      const result = centsToDec(1234);
      expect(result.toNumber()).toBe(12.34);
    });

    it('handles small amounts', () => {
      expect(centsToDec(1).toNumber()).toBe(0.01);
      expect(centsToDec(99).toNumber()).toBe(0.99);
    });

    it('returns Decimal(0) for null/undefined', () => {
      expect(centsToDec(null).toNumber()).toBe(0);
      expect(centsToDec(undefined).toNumber()).toBe(0);
    });

    it('handles large amounts', () => {
      expect(centsToDec(999999999).toNumber()).toBe(9999999.99);
    });

    it('throws on invalid input', () => {
      expect(() => centsToDec(NaN)).toThrow('Invalid cents');
      expect(() => centsToDec(Infinity)).toThrow('Invalid cents');
    });

    it('round-trips with decimalToCents', () => {
      const original = 12.34;
      const cents = decimalToCents(original);
      const back = centsToDec(cents).toNumber();
      expect(back).toBeCloseTo(original, 2);
    });
  });

  describe('isValidAmount', () => {
    it('accepts valid amounts', () => {
      expect(isValidAmount(0)).toBe(true);
      expect(isValidAmount(100)).toBe(true);
      expect(isValidAmount(999999999)).toBe(true);
    });

    it('rejects negative amounts', () => {
      expect(isValidAmount(-1)).toBe(false);
      expect(isValidAmount(-100)).toBe(false);
    });

    it('rejects amounts exceeding max', () => {
      expect(isValidAmount(1000000000)).toBe(false); // 10M+ not allowed
    });

    it('rejects non-integer amounts', () => {
      expect(isValidAmount(123.45)).toBe(false);
      expect(isValidAmount(NaN)).toBe(false);
      expect(isValidAmount(Infinity)).toBe(false);
    });

    it('accepts boundary values', () => {
      expect(isValidAmount(0)).toBe(true);
      expect(isValidAmount(999999999)).toBe(true);
    });
  });

  describe('formatCents', () => {
    it('formats USD correctly', () => {
      expect(formatCents(1234)).toBe('$12.34');
      expect(formatCents(100)).toBe('$1.00');
    });

    it('formats EUR correctly', () => {
      expect(formatCents(1234, 'EUR')).toBe('€12.34');
    });

    it('formats GBP correctly', () => {
      expect(formatCents(1234, 'GBP')).toBe('£12.34');
    });

    it('handles zero', () => {
      expect(formatCents(0, 'USD')).toBe('$0.00');
    });

    it('handles unknown currency codes', () => {
      expect(formatCents(1234, 'XYZ')).toBe('XYZ12.34');
    });

    it('formats large amounts', () => {
      expect(formatCents(999999999, 'USD')).toBe('$9999999.99');
    });
  });

  describe('SUPPORTED_CURRENCIES', () => {
    it('contains common currencies', () => {
      expect(SUPPORTED_CURRENCIES).toContain('EUR');
      expect(SUPPORTED_CURRENCIES).toContain('USD');
      expect(SUPPORTED_CURRENCIES).toContain('GBP');
    });

    it('is a non-empty array', () => {
      expect(SUPPORTED_CURRENCIES.length).toBeGreaterThan(0);
    });
  });

  describe('Financial precision guarantees', () => {
    it('maintains precision for multi-step calculations', () => {
      // Simulating: invoice 100 EUR, partial payment 33.33 EUR, balance should be 66.67 EUR
      const invoiceAmount = decimalToCents(100);
      const paidAmount = decimalToCents(33.33);
      const balance = invoiceAmount - paidAmount;

      expect(balance).toBe(6667); // 66.67 EUR
      expect(centsToDec(balance).toNumber()).toBeCloseTo(66.67, 2);
    });

    it('handles currency conversion with proper rounding', () => {
      // Example: 1000 JPY (no decimal places) should round correctly
      const jpy = decimalToCents(1000);
      expect(jpy).toBe(100000);
      expect(centsToDec(jpy).toNumber()).toBe(1000);
    });
  });
});
