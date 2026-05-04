import { Injectable } from '@nestjs/common';

import type { PaymentProviderPort } from '../ports/payment-provider.port';
import type {
  InvoiceForCheckout,
  PaymentLinkOptions,
  PaymentMethodForProvider,
} from '../payment-models';
import {
  accountDetailsOf,
  fallbackQueryLink,
  resolveConfiguredPayUrl,
  resolveCryptoCheckoutUrl,
} from '../payment-link-helpers';

@Injectable()
export class CryptoAdapter implements PaymentProviderPort {
  getProviderId(): string {
    return 'crypto';
  }

  async generatePaymentLink(
    invoice: InvoiceForCheckout,
    method: PaymentMethodForProvider,
    _options?: PaymentLinkOptions,
  ): Promise<string> {
    const d = accountDetailsOf(method);
    const configured = resolveConfiguredPayUrl(d);
    if (configured) return configured;
    const hint = resolveCryptoCheckoutUrl(d);
    if (hint) return hint;
    const baseUrl = 'https://commerce.coinbase.com';
    return fallbackQueryLink(`${baseUrl}/checkout`, invoice);
  }
}
