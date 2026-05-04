import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import type { PatchProfileDto } from './dto/patch-profile.dto';
import { SubscriptionTier } from '../webhooks/revenuecat.dto';
import { mergeInvoiceDocumentTemplate } from '../freelance/invoice-document-template';
import {
  assertInvoiceNumberingStateValid,
  normalizeInvoiceNumberingRaw,
  peekNextInvoiceNumber,
} from '../freelance/invoice-numbering';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { id: userId },
    });

    if (!profile) {
      throw new NotFoundException({ code: 'PROFILE_NOT_FOUND' });
    }

    return {
      profile: {
        id: profile.id,
        email: profile.email,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        isPremium: profile.isPremium,
        subscriptionTier: profile.subscriptionTier as SubscriptionTier,
        niche: profile.niche,
        expoPushToken: profile.expoPushToken,
        timeZone: profile.timeZone,
        invoiceReminderLocalHour: profile.invoiceReminderLocalHour,
        lastInvoiceReminderSentAt: profile.lastInvoiceReminderSentAt,
        invoiceBrandName: profile.invoiceBrandName,
        invoiceBrandLogoUrl: profile.invoiceBrandLogoUrl,
        invoiceBrandAddress: profile.invoiceBrandAddress,
        invoiceBrandAccentHex: profile.invoiceBrandAccentHex,
        invoiceBrandFooter: profile.invoiceBrandFooter,
        invoiceIssuerTaxId: profile.invoiceIssuerTaxId,
        invoiceDocumentTemplate: mergeInvoiceDocumentTemplate(profile.invoiceDocumentTemplate),
        invoiceNumbering: normalizeInvoiceNumberingRaw(profile.invoiceNumbering),
        invoiceNumberPreview: peekNextInvoiceNumber(profile.invoiceNumbering, new Date()),
        createdAt: profile.createdAt,
      },
    };
  }

  async patchProfile(userId: string, dto: PatchProfileDto) {
    const existing = await this.prisma.profile.findUnique({
      where: { id: userId },
    });
    if (!existing) {
      throw new NotFoundException({ code: 'PROFILE_NOT_FOUND' });
    }

    const data: Prisma.ProfileUpdateInput = {};

    if (dto.invoiceBrandName !== undefined) {
      const v = dto.invoiceBrandName.trim();
      data.invoiceBrandName = v.length ? v : null;
    }
    if (dto.invoiceBrandLogoUrl !== undefined) {
      const v = dto.invoiceBrandLogoUrl.trim();
      data.invoiceBrandLogoUrl = v.length ? v : null;
    }
    if (dto.invoiceBrandAddress !== undefined) {
      const v = dto.invoiceBrandAddress.trim();
      data.invoiceBrandAddress = v.length ? v : null;
    }
    if (dto.invoiceBrandFooter !== undefined) {
      const v = dto.invoiceBrandFooter.trim();
      data.invoiceBrandFooter = v.length ? v : null;
    }
    if (dto.invoiceIssuerTaxId !== undefined) {
      const v = dto.invoiceIssuerTaxId.trim();
      data.invoiceIssuerTaxId = v.length ? v : null;
    }
    if (dto.invoiceDocumentTemplate !== undefined) {
      data.invoiceDocumentTemplate = mergeInvoiceDocumentTemplate(
        dto.invoiceDocumentTemplate,
      ) as object;
    }
    if (dto.invoiceNumbering !== undefined) {
      const norm = normalizeInvoiceNumberingRaw(dto.invoiceNumbering);
      try {
        assertInvoiceNumberingStateValid(norm);
      } catch {
        throw new BadRequestException({ code: 'INVALID_INVOICE_NUMBERING' });
      }
      data.invoiceNumbering = norm as object;
    }
    if (dto.invoiceBrandAccentHex !== undefined) {
      const h = dto.invoiceBrandAccentHex.trim();
      if (!/^#[0-9A-Fa-f]{6}$/.test(h)) {
        throw new BadRequestException({ code: 'INVALID_ACCENT_HEX' });
      }
      data.invoiceBrandAccentHex = h;
    }

    await this.prisma.profile.update({
      where: { id: userId },
      data,
    });

    return this.getMe(userId);
  }
}
