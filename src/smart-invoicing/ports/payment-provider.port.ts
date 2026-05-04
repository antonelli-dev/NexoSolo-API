import type {
  InvoiceForCheckout,
  PaymentLinkOptions,
  PaymentMethodForProvider,
} from '../payment-models';

export interface PaymentProviderPort {
  getProviderId(): string;

  generatePaymentLink(
    invoice: InvoiceForCheckout,
    method: PaymentMethodForProvider,
    options?: PaymentLinkOptions,
  ): Promise<string>;
}
