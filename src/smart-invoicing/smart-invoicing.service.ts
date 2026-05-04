import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import PDFDocument from 'pdfkit';

import { AppLogger } from '../common/logger.service';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoAdapter } from './adapters/crypto.adapter';
import { PayPalAdapter } from './adapters/paypal.adapter';
import { StripeAdapter } from './adapters/stripe.adapter';
import { WiseAdapter } from './adapters/wise.adapter';
import {
  accountDetailsToRecord,
  CreateUserPaymentMethodDto,
  UpdateUserPaymentMethodDto,
} from './dto/payment-method.dto';
import {
  mergeAccountDetails,
  toPaymentMethodForProvider,
  toUserPaymentMethodResponse,
} from './payment-mapper';
import type {
  InvoiceForCheckout,
  PaymentLinkShape,
  SmartInvoice,
  SmartReminderShape,
  UserPaymentMethodResponse,
} from './payment-models';
import type { PaymentProviderPort } from './ports/payment-provider.port';

@Injectable()
export class SmartInvoicingService {
  private readonly logger: AppLogger;
  private readonly paymentProviders: Map<string, PaymentProviderPort> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly stripeAdapter: StripeAdapter,
    private readonly paypalAdapter: PayPalAdapter,
    private readonly wiseAdapter: WiseAdapter,
    private readonly cryptoAdapter: CryptoAdapter,
  ) {
    this.logger = new AppLogger(config);
    this.paymentProviders.set(this.stripeAdapter.getProviderId(), this.stripeAdapter);
    this.paymentProviders.set(this.paypalAdapter.getProviderId(), this.paypalAdapter);
    this.paymentProviders.set(this.wiseAdapter.getProviderId(), this.wiseAdapter);
    this.paymentProviders.set(this.cryptoAdapter.getProviderId(), this.cryptoAdapter);
  }

  async generatePdf(invoiceId: string, userId: string): Promise<Buffer> {
    const invoice = await this.prisma.freelanceInvoice.findFirst({
      where: { id: invoiceId, project: { userId } },
      include: { project: { include: { client: true, user: true } } },
    });

    if (!invoice) throw new Error('Invoice not found');

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(20).text('INVOICE', { align: 'right' });
      doc
        .fontSize(10)
        .text(`Invoice Number: ${invoice.invoiceNumber ?? invoice.id.slice(0, 8)}`, {
          align: 'right',
        });
      doc.text(`Date: ${invoice.createdAt.toLocaleDateString()}`, { align: 'right' });
      doc.text(
        `Due Date: ${invoice.dueDate?.toLocaleDateString() ?? 'Upon receipt'}`,
        { align: 'right' },
      );

      doc.moveDown();
      doc.fontSize(12).text('From:');
      doc.fontSize(10).text(invoice.project.user.email ?? 'Freelancer');
      doc.moveDown();
      doc.fontSize(12).text('To:');
      doc.fontSize(10).text(invoice.project.client.name);
      if (invoice.project.client.email) doc.text(invoice.project.client.email);
      doc.moveDown(2);
      doc.fontSize(14).text('Project Details');
      doc.fontSize(10).text(`Project: ${invoice.project.name}`);
      if (invoice.memo) doc.text(`Memo: ${invoice.memo}`);
      doc.moveDown(2);
      doc.fontSize(14).text('Total Amount', { align: 'right' });
      doc
        .fontSize(24)
        .text(`${Number(invoice.amount).toFixed(2)} ${invoice.currency}`, { align: 'right' });

      doc.end();
    });
  }

  async generatePaymentLinks(userId: string, invoiceId: string): Promise<PaymentLinkShape[]> {
    const rows = await this.loadActiveMethodRows(userId);
    const invoice = await this.prisma.freelanceInvoice.findFirst({
      where: { id: invoiceId, project: { userId } },
      include: { project: { include: { client: true } } },
    });

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    const checkout = this.invoiceToCheckout(invoice);
    const links: PaymentLinkShape[] = [];

    for (const row of rows) {
      if (row.type === 'bank') {
        links.push({
          id: `bank_${invoiceId}`,
          type: 'bank_transfer',
          url: this.bankTransferUrl(invoice.id),
          label: 'Bank Transfer',
          icon: 'building',
          fee: Number(row.feePercentage),
          processingTime: row.processingTime,
        });
        continue;
      }

      const provider = this.paymentProviders.get(row.type);
      const methodPayload = toPaymentMethodForProvider(row.type, row.accountDetails);
      if (!provider || !methodPayload) {
        continue;
      }

      const linkType = this.linkTypeForProviderRow(row.type);
      links.push({
        id: `${row.type}_${invoiceId}`,
        type: linkType,
        url: await provider.generatePaymentLink(checkout, methodPayload),
        label: `Pay with ${row.name}`,
        icon: this.iconForType(row.type),
        fee: Number(row.feePercentage),
        processingTime: row.processingTime,
      });
    }

    return links;
  }

  async createSmartReminders(invoiceId: string): Promise<SmartReminderShape[]> {
    return [
      {
        id: `reminder_1_${invoiceId}`,
        daysBeforeDue: 7,
        daysAfterDue: 0,
        type: 'email',
        template:
          'Hi {{clientName}}, this is a friendly reminder that invoice {{invoiceNumber}} for {{amount}} {{currency}} is due in 7 days on {{dueDate}}.',
        sent: false,
      },
      {
        id: `reminder_2_${invoiceId}`,
        daysBeforeDue: 3,
        daysAfterDue: 0,
        type: 'email',
        template:
          'Hi {{clientName}}, invoice {{invoiceNumber}} for {{amount}} {{currency}} is due in 3 days. You can pay easily using the payment links in the invoice.',
        sent: false,
      },
      {
        id: `reminder_3_${invoiceId}`,
        daysBeforeDue: 0,
        daysAfterDue: 0,
        type: 'email',
        template:
          'Hi {{clientName}}, invoice {{invoiceNumber}} for {{amount}} {{currency}} is due today. Please complete your payment at your earliest convenience.',
        sent: false,
      },
      {
        id: `overdue_1_${invoiceId}`,
        daysBeforeDue: 0,
        daysAfterDue: 3,
        type: 'email',
        template:
          'Hi {{clientName}}, invoice {{invoiceNumber}} for {{amount}} {{currency}} is now 3 days overdue. Please let us know if you have any questions about the payment.',
        sent: false,
      },
      {
        id: `overdue_2_${invoiceId}`,
        daysBeforeDue: 0,
        daysAfterDue: 7,
        type: 'email',
        template:
          'Hi {{clientName}}, invoice {{invoiceNumber}} for {{amount}} {{currency}} is now 7 days overdue. This is a follow-up reminder to complete your payment.',
        sent: false,
      },
      {
        id: `overdue_3_${invoiceId}`,
        daysBeforeDue: 0,
        daysAfterDue: 14,
        type: 'email',
        template:
          'Hi {{clientName}}, invoice {{invoiceNumber}} for {{amount}} {{currency}} is now 14 days overdue. Please contact us immediately to arrange payment.',
        sent: false,
      },
    ];
  }

  async getSmartInvoice(userId: string, invoiceId: string): Promise<SmartInvoice> {
    const invoice = await this.prisma.freelanceInvoice.findFirst({
      where: { id: invoiceId, project: { userId } },
      include: { project: { include: { client: true } } },
    });

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    const qrCode = `https://app.rizzup.com/pay/${invoiceId}`;
    const paymentLinks = await this.generatePaymentLinks(userId, invoiceId);
    const smartReminders = await this.createSmartReminders(invoiceId);

    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber ?? invoice.id.slice(0, 8),
      amount: Number(invoice.amount),
      currency: invoice.currency,
      dueDate: invoice.dueDate ?? new Date(),
      clientName: invoice.project.client.name,
      projectName: invoice.project.name,
      status: invoice.status,
      qrCode,
      paymentLinks,
      smartReminders,
    };
  }

  async listPaymentMethods(userId: string): Promise<UserPaymentMethodResponse[]> {
    const rows = await this.prisma.userPaymentMethod.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => toUserPaymentMethodResponse(r));
  }

  async createPaymentMethod(
    userId: string,
    dto: CreateUserPaymentMethodDto,
  ): Promise<UserPaymentMethodResponse> {
    const jsonDetails = accountDetailsToRecord(dto.accountDetails);
    const row = await this.prisma.userPaymentMethod.create({
      data: {
        userId,
        type: dto.type,
        name: dto.name,
        isActive: dto.isActive,
        processingTime: dto.processingTime,
        feePercentage: dto.fees.percentage,
        feeFixed: dto.fees.fixed,
        feeCurrency: dto.fees.currency,
        ...(jsonDetails !== undefined ? { accountDetails: jsonDetails } : {}),
      },
    });
    return toUserPaymentMethodResponse(row);
  }

  async updatePaymentMethod(
    userId: string,
    methodId: string,
    dto: UpdateUserPaymentMethodDto,
  ): Promise<UserPaymentMethodResponse> {
    const existing = await this.prisma.userPaymentMethod.findFirst({
      where: { id: methodId, userId },
    });
    if (!existing) {
      throw new NotFoundException('Payment method not found');
    }

    const patch: Prisma.UserPaymentMethodUpdateInput = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.isActive !== undefined) patch.isActive = dto.isActive;
    if (dto.processingTime !== undefined) patch.processingTime = dto.processingTime;
    if (dto.fees) {
      patch.feePercentage = dto.fees.percentage;
      patch.feeFixed = dto.fees.fixed;
      patch.feeCurrency = dto.fees.currency;
    }

    const incoming = accountDetailsToRecord(dto.accountDetails);
    if (incoming !== undefined) {
      patch.accountDetails = mergeAccountDetails(existing.accountDetails, incoming);
    }

    const row = await this.prisma.userPaymentMethod.update({
      where: { id: methodId },
      data: patch,
    });
    return toUserPaymentMethodResponse(row);
  }

  async removePaymentMethod(userId: string, methodId: string): Promise<void> {
    const res = await this.prisma.userPaymentMethod.deleteMany({
      where: { id: methodId, userId },
    });
    if (res.count === 0) {
      throw new NotFoundException('Payment method not found');
    }
    this.logger.logBusinessEvent('payment_method_deleted', userId, { methodId });
  }

  async getPendingReminders(): Promise<
    Array<{
      invoiceId: string;
      reminderId: string;
      type: string;
      template: string;
      variables: Record<string, string | number>;
    }>
  > {
    const now = new Date();
    const reminders: Array<{
      invoiceId: string;
      reminderId: string;
      type: string;
      template: string;
      variables: Record<string, string | number>;
    }> = [];

    const invoices = await this.prisma.freelanceInvoice.findMany({
      where: { status: 'sent' },
      include: { project: { include: { client: true } } },
    });

    for (const invoice of invoices) {
      const dueDate = invoice.dueDate ?? invoice.createdAt;
      const daysUntilDue = Math.ceil(
        (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );
      const daysOverdue = Math.ceil(
        (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (daysUntilDue === 7 || daysUntilDue === 3 || daysUntilDue === 0) {
        reminders.push({
          invoiceId: invoice.id,
          reminderId: `reminder_${daysUntilDue}_${invoice.id}`,
          type: 'email',
          template: `Reminder for invoice {{invoiceNumber}} due in ${daysUntilDue} days`,
          variables: {
            invoiceNumber: invoice.invoiceNumber ?? invoice.id.slice(0, 8),
            amount: Number(invoice.amount),
            currency: invoice.currency,
            clientName: invoice.project.client.name,
            dueDate: dueDate.toISOString().split('T')[0],
          },
        });
      }

      if (daysOverdue === 3 || daysOverdue === 7 || daysOverdue === 14) {
        reminders.push({
          invoiceId: invoice.id,
          reminderId: `overdue_${daysOverdue}_${invoice.id}`,
          type: 'email',
          template: `Invoice {{invoiceNumber}} is ${daysOverdue} days overdue`,
          variables: {
            invoiceNumber: invoice.invoiceNumber ?? invoice.id.slice(0, 8),
            amount: Number(invoice.amount),
            currency: invoice.currency,
            clientName: invoice.project.client.name,
            daysOverdue,
          },
        });
      }
    }

    return reminders;
  }

  async sendSmartReminder(invoiceId: string, reminderId: string): Promise<void> {
    const invoice = await this.prisma.freelanceInvoice.findFirst({
      where: { id: invoiceId },
      include: { project: { include: { client: true, user: true } } },
    });

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    this.logger.logBusinessEvent('invoice_reminder_sent', invoice.project.userId, {
      invoiceId,
      reminderId,
    });
  }

  async markInvoiceAsPaid(invoiceId: string, provider: string, transactionId: string): Promise<void> {
    const invoice = await this.prisma.freelanceInvoice.findUnique({
      where: { id: invoiceId },
      include: { project: true },
    });

    if (!invoice) {
      throw new Error(`Invoice ${invoiceId} not found`);
    }

    if (invoice.status === 'paid') {
      this.logger.logBusinessEvent('invoice_already_paid', invoice.project.userId, { invoiceId });
      return;
    }

    await this.prisma.freelanceInvoice.update({
      where: { id: invoiceId },
      data: { status: 'paid' },
    });

    this.logger.logBusinessEvent('invoice_paid', invoice.project.userId, {
      invoiceId,
      provider,
      transactionId,
      amount: Number(invoice.amount),
      currency: invoice.currency,
    });
  }

  private async loadActiveMethodRows(userId: string) {
    return this.prisma.userPaymentMethod.findMany({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  private invoiceToCheckout(invoice: {
    id: string;
    amount: Prisma.Decimal;
    currency: string;
    invoiceNumber: string | null;
    project: { name: string };
  }): InvoiceForCheckout {
    return {
      id: invoice.id,
      amountDecimal: invoice.amount.toString(),
      currency: invoice.currency,
      invoiceNumber: invoice.invoiceNumber,
      projectName: invoice.project.name,
    };
  }

  private bankTransferUrl(invoiceId: string): string {
    const baseUrl = process.env.FRONTEND_URL ?? 'https://app.rizzup.com';
    return `${baseUrl}/bank-transfer/${invoiceId}`;
  }

  private linkTypeForProviderRow(
    type: string,
  ): 'stripe' | 'paypal' | 'wise' | 'bank_transfer' | 'crypto' {
    if (type === 'bank') return 'bank_transfer';
    if (type === 'stripe' || type === 'paypal' || type === 'wise' || type === 'crypto') {
      return type;
    }
    return 'stripe';
  }

  private iconForType(type: string): string {
    if (type === 'stripe') return 'credit-card';
    if (type === 'paypal') return 'paypal';
    return 'wallet';
  }
}
