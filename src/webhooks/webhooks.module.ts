import { Module } from '@nestjs/common';

import { RevenueCatWebhookController } from './revenuecat.controller';

@Module({
  controllers: [RevenueCatWebhookController],
})
export class WebhooksModule {}
