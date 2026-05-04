import type { InvoiceForCheckout, PaymentMethodForProvider } from '../payment-models';

export interface PaymentProviderPort {
  getProviderId(): string;

  generatePaymentLink(
    invoice: InvoiceForCheckout,
    method: PaymentMethodForProvider,
  ): Promise<string>;
}
