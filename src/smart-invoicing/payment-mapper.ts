import type { Prisma } from '@prisma/client';

import type {
  PaymentMethodForProvider,
  PaymentMethodProviderType,
  UserPaymentMethodResponse,
} from './payment-models';

const SECRET_FIELDS = [
  'stripeSecretKey',
  'paypalClientSecret',
  'wiseApiKey',
  'cryptoApiKey',
] as const;

type SecretField = (typeof SECRET_FIELDS)[number];

function isPlainObject(value: Prisma.JsonValue): value is Record<string, Prisma.JsonValue> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function jsonToStringRecord(value: Prisma.JsonValue | null): Record<string, string> {
  if (!isPlainObject(value)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === 'string') {
      out[k] = v;
    }
  }
  return out;
}

const PROVIDER_TYPES: readonly PaymentMethodProviderType[] = [
  'stripe',
  'paypal',
  'wise',
  'bank',
  'crypto',
];

function isPaymentMethodProviderType(s: string): s is PaymentMethodProviderType {
  return (PROVIDER_TYPES as readonly string[]).includes(s);
}

export function toPaymentMethodForProvider(
  type: string,
  accountDetails: Prisma.JsonValue | null,
): PaymentMethodForProvider | null {
  if (!isPaymentMethodProviderType(type)) {
    return null;
  }
  return {
    type,
    accountDetails: jsonToStringRecord(accountDetails),
  };
}

function secretConfigured(details: Record<string, string>, key: SecretField): boolean {
  const v = details[key];
  return typeof v === 'string' && v.length > 0;
}

export function toUserPaymentMethodResponse(row: {
  id: string;
  type: string;
  name: string;
  isActive: boolean;
  processingTime: string;
  feePercentage: Prisma.Decimal;
  feeFixed: number;
  feeCurrency: string;
  accountDetails: Prisma.JsonValue | null;
}): UserPaymentMethodResponse {
  if (!isPaymentMethodProviderType(row.type)) {
    throw new Error(`Invalid payment method type for ${row.id}`);
  }
  const full = jsonToStringRecord(row.accountDetails);
  const safe: Record<string, string> = { ...full };
  for (const key of SECRET_FIELDS) {
    delete safe[key];
  }

  return {
    id: row.id,
    type: row.type,
    name: row.name,
    isActive: row.isActive,
    processingTime: row.processingTime,
    fees: {
      percentage: Number(row.feePercentage),
      fixed: row.feeFixed,
      currency: row.feeCurrency,
    },
    accountDetails: safe,
    credentials: {
      stripeSecretConfigured: secretConfigured(full, 'stripeSecretKey'),
      paypalSecretConfigured: secretConfigured(full, 'paypalClientSecret'),
      wiseKeyConfigured: secretConfigured(full, 'wiseApiKey'),
      cryptoKeyConfigured: secretConfigured(full, 'cryptoApiKey'),
    },
  };
}

function isSecretFieldName(k: string): k is SecretField {
  return (SECRET_FIELDS as readonly string[]).includes(k);
}

export function mergeAccountDetails(
  existing: Prisma.JsonValue | null,
  incoming: Record<string, string> | undefined,
): Prisma.InputJsonValue {
  const base = jsonToStringRecord(existing);
  if (!incoming) {
    return base;
  }
  const merged: Record<string, string> = { ...base };
  for (const [key, value] of Object.entries(incoming)) {
    if (isSecretFieldName(key) && value === '') {
      continue;
    }
    merged[key] = value;
  }
  return merged;
}
