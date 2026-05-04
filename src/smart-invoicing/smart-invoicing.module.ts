import { Module } from '@nestjs/common';
import { SmartInvoicingController } from './smart-invoicing.controller';
import { SmartInvoicingService } from './smart-invoicing.service';
import { PrismaModule } from '../prisma/prisma.module';
import { StripeConnectModule } from '../stripe-connect/stripe-connect.module';
import { StripeAdapter } from './adapters/stripe.adapter';
import { PayPalAdapter } from './adapters/paypal.adapter';
import { CryptoAdapter } from './adapters/crypto.adapter';
import { WiseAdapter } from './adapters/wise.adapter';
import { StripeWebhookController } from './webhooks/stripe-webhook.controller';

@Module({
  imports: [PrismaModule, StripeConnectModule],
  controllers: [SmartInvoicingController, StripeWebhookController],
  providers: [
    SmartInvoicingService,
    StripeAdapter,
    PayPalAdapter,
    WiseAdapter,
    CryptoAdapter,
  ],
  exports: [SmartInvoicingService],
})
export class SmartInvoicingModule {}
