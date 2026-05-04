/** Invoice slice needed by payment providers (no Prisma types in adapters). */
export interface InvoiceForCheckout {
  id: string;
  /** Decimal string from DB, e.g. "123.45" */
  amountDecimal: string;
  currency: string;
  invoiceNumber: string | null;
  projectName: string;
}

export type PaymentMethodProviderType =
  | 'stripe'
  | 'paypal'
  | 'wise'
  | 'bank'
  | 'crypto';

/** Internal shape passed to adapters (includes secrets; never send to clients). */
export interface PaymentMethodForProvider {
  type: PaymentMethodProviderType;
  accountDetails: Record<string, string>;
}

export interface PaymentFeesShape {
  percentage: number;
  fixed: number;
  currency: string;
}

/** API response — secrets stripped; flags indicate prior configuration. */
export interface UserPaymentMethodResponse {
  id: string;
  type: PaymentMethodProviderType;
  name: string;
  isActive: boolean;
  processingTime: string;
  fees: PaymentFeesShape;
  /** Safe string fields only */
  accountDetails: Record<string, string>;
  credentials: {
    stripeSecretConfigured: boolean;
    paypalSecretConfigured: boolean;
    wiseKeyConfigured: boolean;
    cryptoKeyConfigured: boolean;
  };
}

export interface SmartInvoice {
  id: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  dueDate: Date;
  clientName: string;
  projectName: string;
  status: string;
  qrCode: string;
  paymentLinks: PaymentLinkShape[];
  smartReminders: SmartReminderShape[];
}

export interface PaymentLinkShape {
  id: string;
  type: 'stripe' | 'paypal' | 'wise' | 'bank_transfer' | 'crypto';
  url: string;
  label: string;
  icon: string;
  fee?: number;
  processingTime?: string;
}

export interface SmartReminderShape {
  id: string;
  daysBeforeDue: number;
  daysAfterDue: number;
  type: 'email' | 'push' | 'sms';
  template: string;
  sent: boolean;
  sentAt?: Date;
}
