import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

/**
 * Platform Stripe SDK (Connect: direct charges use this key + stripeAccount request option).
 */
@Injectable()
export class StripePlatformClient {
  constructor(private readonly config: ConfigService) {}

  requireStripe(): InstanceType<typeof Stripe> {
    const key = this.config.get<string>('STRIPE_SECRET_KEY');
    if (typeof key !== 'string' || key.length === 0) {
      throw new ServiceUnavailableException({
        code: 'STRIPE_PLATFORM_NOT_CONFIGURED',
        message: 'STRIPE_SECRET_KEY is required for Stripe Connect',
      });
    }
    return new Stripe(key, { apiVersion: '2026-04-22.dahlia' });
  }
}
