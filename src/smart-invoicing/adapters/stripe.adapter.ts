import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

import { AppLogger } from '../../common/logger.service';
import type { PaymentProviderPort } from '../ports/payment-provider.port';
import type { InvoiceForCheckout, PaymentMethodForProvider } from '../payment-models';

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
  return { ...value };
}

@Injectable()
export class StripeAdapter implements PaymentProviderPort {
  private readonly stripeWebhook: InstanceType<typeof Stripe>;
  private readonly logger: AppLogger;

  constructor(private readonly config: ConfigService) {
    this.logger = new AppLogger(config);
    const key = process.env.STRIPE_SECRET_KEY ?? '';
    this.stripeWebhook = new Stripe(key || 'sk_test_mock', {
      apiVersion: '2026-04-22.dahlia',
    });
  }

  getProviderId(): string {
    return 'stripe';
  }

  private resolveSecret(method: PaymentMethodForProvider): string {
    const fromUser = method.accountDetails['stripeSecretKey'];
    if (typeof fromUser === 'string' && fromUser.length > 0) {
      return fromUser;
    }
    const fromEnv = process.env.STRIPE_SECRET_KEY;
    if (typeof fromEnv === 'string' && fromEnv.length > 0) {
      return fromEnv;
    }
    return 'sk_test_mock';
  }

  async generatePaymentLink(
    invoice: InvoiceForCheckout,
    method: PaymentMethodForProvider,
  ): Promise<string> {
    const stripe = new Stripe(this.resolveSecret(method), {
      apiVersion: '2026-04-22.dahlia',
    });
    const label = invoice.invoiceNumber ?? invoice.id.slice(0, 8);
    try {
      const session = await stripe.checkout.sessions.create(
        {
          payment_method_types: ['card'],
          line_items: [
            {
              price_data: {
                currency: invoice.currency.toLowerCase(),
                product_data: {
                  name: `Invoice ${label}`,
                  description: `Project: ${invoice.projectName}`,
                },
                unit_amount: Math.round(Number(invoice.amountDecimal) * 100),
              },
              quantity: 1,
            },
          ],
          mode: 'payment',
          success_url: `${process.env.FRONTEND_URL || 'https://app.rizzup.com'}/pay/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.FRONTEND_URL || 'https://app.rizzup.com'}/pay/cancel`,
          client_reference_id: invoice.id,
        },
        { idempotencyKey: `checkout_inv_${invoice.id}` },
      );
      return session.url ?? '';
    } catch (error) {
      this.logger.error('Failed to generate Stripe link', {
        error: error instanceof Error ? error.stack : String(error),
      });
      const baseUrl = 'https://checkout.stripe.com';
      return `${baseUrl}/pay?invoice=${invoice.id}&amount=${
        Number(invoice.amountDecimal) * 100
      }&currency=${invoice.currency}`;
    }
  }

  constructEventFromPayload(payload: Buffer, signature: string): StripeWebhookEvent {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is not set');
    }
    const constructed = this.stripeWebhook.webhooks.constructEvent(
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
