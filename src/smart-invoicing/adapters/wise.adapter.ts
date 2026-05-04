import { Injectable } from '@nestjs/common';

import type { PaymentProviderPort } from '../ports/payment-provider.port';
import type { InvoiceForCheckout, PaymentMethodForProvider } from '../payment-models';

@Injectable()
export class WiseAdapter implements PaymentProviderPort {
  getProviderId(): string {
    return 'wise';
  }

  async generatePaymentLink(
    invoice: InvoiceForCheckout,
    _method: PaymentMethodForProvider,
  ): Promise<string> {
    const baseUrl = 'https://wise.com';
    return `${baseUrl}/pay?invoice=${invoice.id}&amount=${invoice.amountDecimal}&currency=${invoice.currency}`;
  }
}
