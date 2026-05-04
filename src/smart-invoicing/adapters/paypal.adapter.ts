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
  resolvePaypalMeUrl,
} from '../payment-link-helpers';

@Injectable()
export class PayPalAdapter implements PaymentProviderPort {
  getProviderId(): string {
    return 'paypal';
  }

  async generatePaymentLink(
    invoice: InvoiceForCheckout,
    _method: PaymentMethodForProvider,
    _options?: PaymentLinkOptions,
  ): Promise<string> {
    const d = accountDetailsOf(_method);
    const configured = resolveConfiguredPayUrl(d);
    if (configured) return configured;
    const me = resolvePaypalMeUrl(d);
    if (me) return me;
    const baseUrl = 'https://www.paypal.com';
    return fallbackQueryLink(`${baseUrl}/pay`, invoice);
  }
}
