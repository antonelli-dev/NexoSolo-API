import { NotFoundException } from '@nestjs/common';

import { UsersService } from './users.service';

describe('UsersService', () => {
  const prisma = {
    profile: {
      findUnique: jest.fn(),
    },
  } as any;

  beforeEach(() => {
    prisma.profile.findUnique.mockReset();
  });

  it('throws PROFILE_NOT_FOUND when profile missing', async () => {
    prisma.profile.findUnique.mockResolvedValue(null);
    const svc = new UsersService(prisma);
    await expect(svc.getMe('u1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns expanded profile fields', async () => {
    prisma.profile.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      displayName: 'Anton',
      avatarUrl: null,
      isPremium: false,
      subscriptionTier: 'free',
      niche: 'uxui',
      expoPushToken: 'ExponentPushToken[xxx]',
      timeZone: 'Europe/Madrid',
      invoiceReminderLocalHour: 9,
      lastInvoiceReminderSentAt: null,
      invoiceBrandName: 'ACME Freelance',
      invoiceBrandLogoUrl: null,
      invoiceBrandAddress: 'Madrid, ES',
      invoiceBrandAccentHex: '#6366f1',
      invoiceBrandFooter: 'Thank you.',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const svc = new UsersService(prisma);
    const res = await svc.getMe('u1');
    expect(res.profile).toMatchObject({
      id: 'u1',
      email: 'a@b.com',
      displayName: 'Anton',
      isPremium: false,
      subscriptionTier: 'free',
      niche: 'uxui',
      expoPushToken: 'ExponentPushToken[xxx]',
      timeZone: 'Europe/Madrid',
      invoiceReminderLocalHour: 9,
      lastInvoiceReminderSentAt: null,
      invoiceBrandName: 'ACME Freelance',
      invoiceBrandLogoUrl: null,
      invoiceBrandAddress: 'Madrid, ES',
      invoiceBrandAccentHex: '#6366f1',
      invoiceBrandFooter: 'Thank you.',
    });
  });
});
