import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from './auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { FreelanceModule } from './freelance/freelance.module';
import { AiModule } from './ai/ai.module';
import { FxModule } from './fx/fx.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SmartInvoicingModule } from './smart-invoicing/smart-invoicing.module';
import { StripeConnectModule } from './stripe-connect/stripe-connect.module';
import { GamificationModule } from './gamification/gamification.module';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { AutomationModule } from './automation/automation.module';
import { DocumentsModule } from './documents/documents.module';
import { RolesModule } from './roles/roles.module';
import { ClientPortalModule } from './client-portal/client-portal.module';
import { ReferralsModule } from './referrals/referrals.module';
import { LoggerModule } from './common/logger.module';
import { validate } from './common/env.validation';
import { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { SecurityMiddleware } from './common/security.middleware';
import { RateLimitingService } from './common/rate-limiting.service';
import { ValidationService } from './common/validation.service';
import { ErrorHandlingService } from './common/error-handling.service';

// Throttle configuration: reduced from 120 to 60 req/min for better security
const ratePerMin = Number(process.env.RATE_LIMIT_PER_MIN ?? 60);

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
    ThrottlerModule.forRoot({
      skipIf: (ctx) => {
        const req = ctx.switchToHttp().getRequest<{ url?: string; originalUrl?: string }>();
        const url = req.originalUrl ?? req.url ?? '';
        // Skip rate limiting for health checks
        return url.startsWith('/health');
      },
      throttlers: [
        {
          name: 'default',
          ttl: 60_000,
          limit: Number.isFinite(ratePerMin) && ratePerMin > 0 ? ratePerMin : 60,
        },
      ],
    }),
    PrismaModule,
    HealthModule,
    UsersModule,
    FreelanceModule,
    FxModule,
    AiModule,
    AuthModule,
    WebhooksModule,
    SubscriptionModule,
    AnalyticsModule,
    NotificationsModule,
    SmartInvoicingModule,
    StripeConnectModule,
    GamificationModule,
    MarketplaceModule,
    AutomationModule,
    DocumentsModule,
    RolesModule,
    ClientPortalModule,
    ReferralsModule,
    LoggerModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    SecurityMiddleware,
    RateLimitingService,
    ValidationService,
    ErrorHandlingService,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(SecurityMiddleware)
      .forRoutes('*'); // Apply to all routes
  }
}
