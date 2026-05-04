import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

import { AppLogger } from '../../common/logger.service';
import type { PaymentProviderPort } from '../ports/payment-provider.port';
import type {
  InvoiceForCheckout,
  PaymentLinkOptions,
  PaymentMethodForProvider,
} from '../payment-models';

export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
}

function unknownToRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = v;
  }
  return out;
}

type StripeClient = InstanceType<typeof Stripe>;

type CheckoutSessionCreateBody = Parameters<
  StripeClient['checkout']['sessions']['create']
>[0];

@Injectable()
export class StripeAdapter implements PaymentProviderPort {
  private readonly stripeVerify: StripeClient;
  private readonly logger: AppLogger;

  constructor(private readonly config: ConfigService) {
    this.logger = new AppLogger(config);
    const platformKey = this.config.get<string>('STRIPE_SECRET_KEY') ?? '';
    this.stripeVerify = new Stripe(platformKey.length > 0 ? platformKey : 'sk_test_mock', {
      apiVersion: '2026-04-22.dahlia',
    });
  }

  getProviderId(): string {
    return 'stripe';
  }

  /** Legacy: per-method secret or platform env key for non-Connect Checkout. */
  private resolveSecretForDirectAccount(method: PaymentMethodForProvider): string | null {
    const fromUser = method.accountDetails['stripeSecretKey'];
    if (typeof fromUser === 'string' && fromUser.length > 0) {
      return fromUser;
    }
    const fromEnv = this.config.get<string>('STRIPE_SECRET_KEY');
    if (typeof fromEnv === 'string' && fromEnv.length > 0) {
      return fromEnv;
    }
    return null;
  }

  private platformStripeForConnect(): StripeClient | null {
    const key = this.config.get<string>('STRIPE_SECRET_KEY');
    if (typeof key !== 'string' || key.length === 0) {
      return null;
    }
    return new Stripe(key, { apiVersion: '2026-04-22.dahlia' });
  }

  async generatePaymentLink(
    invoice: InvoiceForCheckout,
    method: PaymentMethodForProvider,
    options?: PaymentLinkOptions,
  ): Promise<string> {
    const connectId = options?.stripe?.connectedAccountId;
    if (typeof connectId === 'string' && connectId.startsWith('acct_')) {
      const stripe = this.platformStripeForConnect();
      if (stripe === null) {
        return this.fallbackCheckoutUrl(invoice);
      }
      const sub = options?.stripe;
      const fee =
        sub !== undefined && typeof sub.applicationFeeAmountCents === 'number'
          ? sub.applicationFeeAmountCents
          : undefined;
      return this.createCheckoutSession({
        stripe,
        invoice,
        requestOptions: { stripeAccount: connectId },
        idempotencySuffix: `connect_${connectId}`,
        applicationFeeAmountCents: fee,
      });
    }

    const secret = this.resolveSecretForDirectAccount(method);
    if (secret === null) {
      return this.fallbackCheckoutUrl(invoice);
    }

    const stripe = new Stripe(secret, { apiVersion: '2026-04-22.dahlia' });
    return this.createCheckoutSession({
      stripe,
      invoice,
      requestOptions: undefined,
      idempotencySuffix: 'legacy',
      applicationFeeAmountCents: undefined,
    });
  }

  private async createCheckoutSession(params: {
    stripe: StripeClient;
    invoice: InvoiceForCheckout;
    requestOptions: { stripeAccount?: string } | undefined;
    idempotencySuffix: string;
    applicationFeeAmountCents: number | undefined;
  }): Promise<string> {
    const { stripe, invoice, requestOptions, idempotencySuffix, applicationFeeAmountCents } =
      params;
    const label = invoice.invoiceNumber ?? invoice.id.slice(0, 8);
    const unitAmount = Math.round(Number(invoice.amountDecimal) * 100);

    const sessionParams: CheckoutSessionCreateBody = {
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: invoice.currency.toLowerCase(),
            product_data: {
              name: `Invoice ${label}`,
              description: `Project: ${invoice.projectName}`,
            },
            unit_amount: unitAmount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${this.config.get<string>('FRONTEND_URL') ?? 'https://app.rizzup.com'}/pay/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${this.config.get<string>('FRONTEND_URL') ?? 'https://app.rizzup.com'}/pay/cancel`,
      client_reference_id: invoice.id,
    };

    if (typeof applicationFeeAmountCents === 'number' && applicationFeeAmountCents > 0) {
      sessionParams.payment_intent_data = {
        application_fee_amount: applicationFeeAmountCents,
      };
    }

    const createOptions: { idempotencyKey: string; stripeAccount?: string } = {
      idempotencyKey: `checkout_inv_${invoice.id}_${idempotencySuffix}`,
    };
    if (requestOptions?.stripeAccount !== undefined) {
      createOptions.stripeAccount = requestOptions.stripeAccount;
    }

    try {
      const session = await stripe.checkout.sessions.create(sessionParams, createOptions);
      return typeof session.url === 'string' ? session.url : '';
    } catch (error) {
      this.logger.error('Failed to generate Stripe link', {
        error: error instanceof Error ? error.stack : String(error),
      });
      return this.fallbackCheckoutUrl(invoice);
    }
  }

  private fallbackCheckoutUrl(invoice: InvoiceForCheckout): string {
    const baseUrl = 'https://checkout.stripe.com';
    return `${baseUrl}/pay?invoice=${invoice.id}&amount=${
      Number(invoice.amountDecimal) * 100
    }&currency=${invoice.currency}`;
  }

  constructEventFromPayload(payload: Buffer, signature: string): StripeWebhookEvent {
    const webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (typeof webhookSecret !== 'string' || webhookSecret.length === 0) {
      throw new Error('STRIPE_WEBHOOK_SECRET is not set');
    }
    const constructed = this.stripeVerify.webhooks.constructEvent(
      payload,
      signature,
      webhookSecret,
    );
    return {
      id: constructed.id,
      type: constructed.type,
      data: { object: unknownToRecord(constructed.data.object) },
    };
  }
}
