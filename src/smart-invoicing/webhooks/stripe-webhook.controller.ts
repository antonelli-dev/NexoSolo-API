import { Controller, Post, Req, Res, Headers, BadRequestException } from '@nestjs/common';
import { Request, Response } from 'express';
import { StripeAdapter, StripeWebhookEvent } from '../adapters/stripe.adapter';
import { SmartInvoicingService } from '../smart-invoicing.service';
import { AppLogger } from '../../common/logger.service';
import { ConfigService } from '@nestjs/config';

interface RequestWithRawBody extends Request {
  rawBody?: Buffer;
}

@Controller('v1/webhooks/stripe')
export class StripeWebhookController {
  private readonly logger: AppLogger;

  constructor(
    private readonly stripeAdapter: StripeAdapter,
    private readonly smartInvoicingService: SmartInvoicingService,
    private readonly config: ConfigService,
  ) {
    this.logger = new AppLogger(config);
  }

  @Post()
  async handleStripeWebhook(
    @Req() req: RequestWithRawBody,
    @Res() res: Response,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    try {
      // NestJS with rawBody: true populates req.rawBody
      const rawBody = req.rawBody;
      if (!rawBody) {
        throw new BadRequestException('Raw body not available. Ensure rawBody: true is set in NestFactory.create');
      }

      // Verify signature and get the event
      const event = this.stripeAdapter.constructEventFromPayload(rawBody, signature);

      // Handle the event
      await this.processStripeEvent(event);

      // Return a 200 response to acknowledge receipt of the event
      return res.status(200).send({ received: true });
    } catch (err) {
      this.logger.error('Stripe webhook error', { error: err instanceof Error ? err.message : String(err) });
      return res.status(400).send(`Webhook Error: ${err instanceof Error ? err.message : 'Unknown Error'}`);
    }
  }

  private async processStripeEvent(event: StripeWebhookEvent): Promise<void> {
    // Handle the checkout.session.completed event
    if (event.type === 'checkout.session.completed') {
      // We know it's a Checkout Session based on the event type
      const session = event.data.object;
      
      // Fulfill the purchase...
      // Stripe.Event.Data.Object doesn't have client_reference_id directly in its base type,
      // but we know it's there for checkout.session.completed.
      // To avoid 'as' assertion, we can check if it exists:
      if ('client_reference_id' in session && typeof session.client_reference_id === 'string') {
        const invoiceId = session.client_reference_id;
        const sessionId = typeof session.id === 'string' ? session.id : 'unknown';
        this.logger.logBusinessEvent('stripe_checkout_completed', 'system', { invoiceId, sessionId });
        await this.smartInvoicingService.markInvoiceAsPaid(invoiceId, 'stripe', sessionId);
      } else {
        const sessionId = typeof session.id === 'string' ? session.id : 'unknown';
        this.logger.error('Stripe checkout completed but no client_reference_id found', { sessionId });
      }
    }
  }
}
