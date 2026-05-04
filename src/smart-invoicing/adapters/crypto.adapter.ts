import { Injectable } from '@nestjs/common';

import type { PaymentProviderPort } from '../ports/payment-provider.port';
import type { InvoiceForCheckout, PaymentMethodForProvider } from '../payment-models';

@Injectable()
export class CryptoAdapter implements PaymentProviderPort {
  getProviderId(): string {
    return 'crypto';
  }

  async generatePaymentLink(
    invoice: InvoiceForCheckout,
    _method: PaymentMethodForProvider,
  ): Promise<string> {
    const baseUrl = 'https://commerce.coinbase.com';
    return `${baseUrl}/checkout?invoice=${invoice.id}&amount=${invoice.amountDecimal}&currency=${invoice.currency}`;
  }
}
