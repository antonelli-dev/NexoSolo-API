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
  resolveWisePayMeUrl,
} from '../payment-link-helpers';

@Injectable()
export class WiseAdapter implements PaymentProviderPort {
  getProviderId(): string {
    return 'wise';
  }

  async generatePaymentLink(
    invoice: InvoiceForCheckout,
    method: PaymentMethodForProvider,
    _options?: PaymentLinkOptions,
  ): Promise<string> {
    const d = accountDetailsOf(method);
    const configured = resolveConfiguredPayUrl(d);
    if (configured) return configured;
    const wise = resolveWisePayMeUrl(d);
    if (wise) return wise;
    const baseUrl = 'https://wise.com';
    return fallbackQueryLink(`${baseUrl}/pay`, invoice);
  }
}
