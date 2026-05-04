import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Optional platform fee on Connect payments (basis points, env-driven).
 */
@Injectable()
export class StripeConnectFeePolicy {
  constructor(private readonly config: ConfigService) {}

  /** Fee in cents, or undefined when disabled / zero. */
  applicationFeeCentsForPayment(amountCents: number): number | undefined {
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return undefined;
    }
    const raw = this.config.get<string>('STRIPE_CONNECT_APPLICATION_FEE_BPS');
    if (raw === undefined || raw === null || raw === '') {
      return undefined;
    }
    const bps = Number.parseInt(raw, 10);
    if (!Number.isFinite(bps) || bps <= 0) {
      return undefined;
    }
    const fee = Math.floor((amountCents * bps) / 10_000);
    return fee > 0 ? fee : undefined;
  }
}
