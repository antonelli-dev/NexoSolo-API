import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../prisma/prisma.service';
import { StripePlatformClient } from './stripe-platform.client';
import type { CreateStripeOnboardingLinkDto } from './dto/create-onboarding-link.dto';

export type StripeConnectStatusResponse = Readonly<{
  accountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  readyForPayments: boolean;
}>;

@Injectable()
export class StripeConnectService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly stripePlatform: StripePlatformClient,
  ) {}

  async getStatus(userId: string): Promise<StripeConnectStatusResponse> {
    const profile = await this.prisma.profile.findUnique({
      where: { id: userId },
      select: {
        stripeConnectAccountId: true,
        stripeConnectChargesEnabled: true,
        stripeConnectPayoutsEnabled: true,
        stripeConnectDetailsSubmitted: true,
      },
    });
    if (!profile) {
      throw new NotFoundException({ code: 'PROFILE_NOT_FOUND' });
    }
    return {
      accountId: profile.stripeConnectAccountId,
      chargesEnabled: profile.stripeConnectChargesEnabled,
      payoutsEnabled: profile.stripeConnectPayoutsEnabled,
      detailsSubmitted: profile.stripeConnectDetailsSubmitted,
      readyForPayments:
        profile.stripeConnectChargesEnabled &&
        profile.stripeConnectDetailsSubmitted,
    };
  }

  async createExpressAccountIfNeeded(userId: string): Promise<string> {
    const profile = await this.prisma.profile.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        stripeConnectAccountId: true,
      },
    });
    if (!profile) {
      throw new NotFoundException({ code: 'PROFILE_NOT_FOUND' });
    }
    if (
      typeof profile.stripeConnectAccountId === 'string' &&
      profile.stripeConnectAccountId.length > 0
    ) {
      return profile.stripeConnectAccountId;
    }

    const country = this.resolveDefaultCountry();
    const stripe = this.stripePlatform.requireStripe();
    const account = await stripe.accounts.create({
      type: 'express',
      country,
      email: profile.email ?? undefined,
      metadata: { profile_id: profile.id },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });

    await this.prisma.profile.update({
      where: { id: userId },
      data: { stripeConnectAccountId: account.id },
    });

    return account.id;
  }

  async createOnboardingLink(
    userId: string,
    dto: CreateStripeOnboardingLinkDto,
  ): Promise<{ url: string }> {
    const accountId = await this.createExpressAccountIfNeeded(userId);
    const stripe = this.stripePlatform.requireStripe();
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: dto.refreshUrl,
      return_url: dto.returnUrl,
      type: 'account_onboarding',
    });
    if (typeof link.url !== 'string' || link.url.length === 0) {
      throw new BadRequestException({ code: 'STRIPE_ONBOARDING_LINK_EMPTY' });
    }
    return { url: link.url };
  }

  private resolveDefaultCountry(): string {
    const raw = this.config.get<string>('STRIPE_CONNECT_DEFAULT_COUNTRY');
    if (typeof raw === 'string' && /^[A-Za-z]{2}$/.test(raw.trim())) {
      return raw.trim().toUpperCase();
    }
    throw new BadRequestException({
      code: 'STRIPE_CONNECT_DEFAULT_COUNTRY_INVALID',
      message:
        'Set STRIPE_CONNECT_DEFAULT_COUNTRY to a 2-letter ISO country code (e.g. ES, DE, US)',
    });
  }
}
