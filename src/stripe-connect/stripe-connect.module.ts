import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { StripeConnectController } from './stripe-connect.controller';
import { StripeConnectService } from './stripe-connect.service';
import { StripeConnectAccountSyncService } from './stripe-connect-account-sync.service';
import { StripeConnectFeePolicy } from './stripe-connect-fee.policy';
import { StripePlatformClient } from './stripe-platform.client';

@Module({
  imports: [PrismaModule],
  controllers: [StripeConnectController],
  providers: [
    StripePlatformClient,
    StripeConnectService,
    StripeConnectAccountSyncService,
    StripeConnectFeePolicy,
  ],
  exports: [
    StripeConnectAccountSyncService,
    StripeConnectFeePolicy,
  ],
})
export class StripeConnectModule {}
