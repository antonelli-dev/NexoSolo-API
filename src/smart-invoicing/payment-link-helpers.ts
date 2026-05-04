import type { PaymentMethodForProvider } from './payment-models';

function trimHttpUrl(raw: string | undefined): string | null {
  const t = raw?.trim();
  if (!t) return null;
  if (t.startsWith('https://') || t.startsWith('http://')) return t;
  return null;
}

/** Prefer user-configured HTTPS payment page when present in accountDetails JSON. */
export function resolveConfiguredPayUrl(details: Record<string, string>): string | null {
  return trimHttpUrl(details.externalPayUrl) ?? trimHttpUrl(details.paymentUrl);
}

export function resolvePaypalMeUrl(details: Record<string, string>): string | null {
  const h = details.paypalMeHandle?.trim().replace(/^@/, '');
  if (!h) return null;
  return `https://paypal.me/${encodeURIComponent(h)}`;
}

/** Wise "pay me" profile slug or full URL in wiseProfileId. */
export function resolveWisePayMeUrl(details: Record<string, string>): string | null {
  const id = details.wiseProfileId?.trim();
  if (!id) return null;
  if (/^https?:\/\//i.test(id)) return id;
  return `https://wise.com/pay/me/${encodeURIComponent(id)}`;
}

export function resolveCryptoCheckoutUrl(details: Record<string, string>): string | null {
  return trimHttpUrl(details.cryptoCheckoutHint);
}

export function fallbackQueryLink(
  base: string,
  invoice: { id: string; amountDecimal: string; currency: string },
): string {
  return `${base}?invoice=${encodeURIComponent(invoice.id)}&amount=${encodeURIComponent(
    invoice.amountDecimal,
  )}&currency=${encodeURIComponent(invoice.currency)}`;
}

export function accountDetailsOf(method: PaymentMethodForProvider): Record<string, string> {
  return method.accountDetails;
}
