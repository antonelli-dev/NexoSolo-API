import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import type { StripeConnectAccountSnapshot } from './stripe-connect-account.parse';

@Injectable()
export class StripeConnectAccountSyncService {
  constructor(private readonly prisma: PrismaService) {}

  async applySnapshot(snapshot: StripeConnectAccountSnapshot): Promise<void> {
    const byMeta =
      snapshot.profileIdFromMetadata !== null
        ? await this.prisma.profile.findUnique({
            where: { id: snapshot.profileIdFromMetadata },
            select: { id: true },
          })
        : null;

    const profile =
      byMeta ??
      (await this.prisma.profile.findFirst({
        where: { stripeConnectAccountId: snapshot.accountId },
        select: { id: true },
      }));

    if (!profile) {
      return;
    }

    await this.prisma.profile.update({
      where: { id: profile.id },
      data: {
        stripeConnectChargesEnabled: snapshot.chargesEnabled,
        stripeConnectPayoutsEnabled: snapshot.payoutsEnabled,
        stripeConnectDetailsSubmitted: snapshot.detailsSubmitted,
      },
    });
  }
}
