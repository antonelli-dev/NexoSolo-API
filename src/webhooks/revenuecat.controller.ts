import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import { PrismaService } from '../prisma/prisma.service';
import { RevenueCatWebhookDto, RevenueCatEventType, SubscriptionTier } from './revenuecat.dto';
import { AppLogger } from '../common/logger.service';

@ApiTags('webhooks')
@Controller('webhooks/revenuecat')
export class RevenueCatWebhookController {
  private readonly logger: AppLogger;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.logger = new AppLogger(config);
  }

  @Get()
  health() {
    return { status: 'ok', service: 'revenuecat-webhook' };
  }

  @Post()
  @HttpCode(200)
  async handleWebhook(
    @Body() payload: RevenueCatWebhookDto,
    @Headers() headers: Record<string, string>,
    req: Request,
  ) {
    // Verify webhook signature
    const authHeader = headers['authorization'];
    const expectedAuth = this.config.get<string>('REVENUECAT_WEBHOOK_AUTH');
    
    if (!expectedAuth) {
      throw new UnauthorizedException('Webhook authentication not configured');
    }

    if (authHeader !== `Bearer ${expectedAuth}`) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    try {
      await this.processWebhookEvent(payload);
      return { status: 'processed' };
    } catch (error) {
      this.logger.logError(error as Error, { 
        action: 'revenuecat_webhook_processing_failed',
        userId: payload.app_user_id,
        eventType: payload.event_type
      });
      // Return 200 to prevent RevenueCat from retrying
      return { status: 'error', message: 'Processing failed' };
    }
  }

  private async processWebhookEvent(payload: RevenueCatWebhookDto) {
    const { event_type, app_user_id, entitlement_id, product_id } = payload;

    // Determine subscription tier based on entitlement
    const tier = this.determineSubscriptionTier(entitlement_id, product_id);

    switch (event_type) {
      case RevenueCatEventType.INITIAL_PURCHASE:
      case RevenueCatEventType.RENEWAL:
      case RevenueCatEventType.SUBSCRIPTION_EXTENDED:
        await this.activateSubscription(app_user_id, tier, payload);
        break;

      case RevenueCatEventType.CANCELLATION:
      case RevenueCatEventType.EXPIRATION:
        await this.deactivateSubscription(app_user_id, payload);
        break;

      case RevenueCatEventType.UNCANCELLATION:
        await this.activateSubscription(app_user_id, tier, payload);
        break;

      default:
        this.logger.warn(`Unhandled RevenueCat event type: ${event_type}`, {
          userId: app_user_id,
          eventType: event_type,
          entitlementId: entitlement_id,
          productId: product_id
        });
    }
  }

  private determineSubscriptionTier(
    entitlementId?: string,
    productId?: string,
  ): SubscriptionTier {
    // Check entitlement ID first (more reliable)
    if (entitlementId) {
      if (entitlementId.includes('premium_plus')) return SubscriptionTier.PREMIUM_PLUS;
      if (entitlementId.includes('premium')) return SubscriptionTier.PREMIUM;
    }

    // Fallback to product ID
    if (productId) {
      if (productId.includes('premium_plus')) return SubscriptionTier.PREMIUM_PLUS;
      if (productId.includes('premium')) return SubscriptionTier.PREMIUM;
    }

    return SubscriptionTier.FREE;
  }

  private async activateSubscription(
    userId: string,
    tier: SubscriptionTier,
    payload: RevenueCatWebhookDto,
  ) {
    const isPremium = tier !== SubscriptionTier.FREE;
    
    await this.prisma.profile.update({
      where: { id: userId },
      data: {
        isPremium,
        subscriptionTier: tier,
        updatedAt: new Date(),
      },
    });

    this.logger.logBusinessEvent('subscription_activated', userId, { tier });
  }

  private async deactivateSubscription(
    userId: string,
    payload: RevenueCatWebhookDto,
  ) {
    await this.prisma.profile.update({
      where: { id: userId },
      data: {
        isPremium: false,
        subscriptionTier: SubscriptionTier.FREE,
        updatedAt: new Date(),
      },
    });

    this.logger.logBusinessEvent('subscription_deactivated', userId, { payload });
  }
}
