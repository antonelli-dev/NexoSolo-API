import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppLogger } from '../common/logger.service';
import { ConfigService } from '@nestjs/config';

export interface SmartInvoice {
  id: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  dueDate: Date;
  clientName: string;
  projectName: string;
  status: string;
  qrCode: string;
  paymentLinks: PaymentLink[];
  smartReminders: SmartReminder[];
}

export interface PaymentLink {
  id: string;
  type: 'stripe' | 'paypal' | 'wise' | 'bank_transfer' | 'crypto';
  url: string;
  label: string;
  icon: string;
  fee?: number;
  processingTime?: string;
}

export interface SmartReminder {
  id: string;
  daysBeforeDue: number;
  daysAfterDue: number;
  type: 'email' | 'push' | 'sms';
  template: string;
  sent: boolean;
  sentAt?: Date;
}

export interface PaymentMethod {
  id: string;
  type: 'stripe' | 'paypal' | 'wise' | 'bank' | 'crypto';
  name: string;
  isActive: boolean;
  accountDetails?: Record<string, any>;
  fees: {
    percentage: number;
    fixed: number;
    currency: string;
  };
  processingTime: string;
}

@Injectable()
export class SmartInvoicingService {
  private readonly logger: AppLogger;

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {
    this.logger = new AppLogger(config);
  }

  async generateQRCode(invoiceId: string): Promise<string> {
    // Generate QR code that links to invoice payment page
    const baseUrl = process.env.FRONTEND_URL || 'https://app.rizzup.com';
    const paymentUrl = `${baseUrl}/pay/${invoiceId}`;
    
    // TODO: Use QR code library to generate actual QR code
    // For now, return the URL that would be encoded in QR
    return paymentUrl;
  }

  async generatePaymentLinks(userId: string, invoiceId: string): Promise<PaymentLink[]> {
    const paymentMethods = await this.getUserPaymentMethods(userId);
    const invoice = await this.prisma.freelanceInvoice.findFirst({
      where: { id: invoiceId, project: { userId } },
      include: { project: { include: { client: true } } },
    });

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    const links: PaymentLink[] = [];

    for (const method of paymentMethods.filter(m => m.isActive)) {
      switch (method.type) {
        case 'stripe':
          links.push({
            id: `stripe_${invoiceId}`,
            type: 'stripe',
            url: this.generateStripePaymentLink(invoice, method),
            label: 'Pay with Card',
            icon: 'credit-card',
            fee: method.fees.percentage,
            processingTime: 'Instant',
          });
          break;
        case 'paypal':
          links.push({
            id: `paypal_${invoiceId}`,
            type: 'paypal',
            url: this.generatePayPalPaymentLink(invoice, method),
            label: 'Pay with PayPal',
            icon: 'paypal',
            fee: method.fees.percentage,
            processingTime: 'Instant',
          });
          break;
        case 'wise':
          links.push({
            id: `wise_${invoiceId}`,
            type: 'wise',
            url: this.generateWisePaymentLink(invoice, method),
            label: 'Pay with Wise',
            icon: 'globe',
            fee: method.fees.percentage,
            processingTime: '1-2 days',
          });
          break;
        case 'bank':
          links.push({
            id: `bank_${invoiceId}`,
            type: 'bank_transfer',
            url: this.generateBankTransferDetails(invoice, method),
            label: 'Bank Transfer',
            icon: 'building',
            fee: 0,
            processingTime: '1-3 days',
          });
          break;
        case 'crypto':
          links.push({
            id: `crypto_${invoiceId}`,
            type: 'crypto',
            url: this.generateCryptoPaymentLink(invoice, method),
            label: 'Pay with Crypto',
            icon: 'bitcoin',
            fee: method.fees.percentage,
            processingTime: 'Instant',
          });
          break;
      }
    }

    return links;
  }

  async createSmartReminders(invoiceId: string): Promise<SmartReminder[]> {
    const reminders: SmartReminder[] = [
      {
        id: `reminder_1_${invoiceId}`,
        daysBeforeDue: 7,
        daysAfterDue: 0,
        type: 'email',
        template: 'Hi {{clientName}}, this is a friendly reminder that invoice {{invoiceNumber}} for {{amount}} {{currency}} is due in 7 days on {{dueDate}}.',
        sent: false,
      },
      {
        id: `reminder_2_${invoiceId}`,
        daysBeforeDue: 3,
        daysAfterDue: 0,
        type: 'email',
        template: 'Hi {{clientName}}, invoice {{invoiceNumber}} for {{amount}} {{currency}} is due in 3 days. You can pay easily using the payment links in the invoice.',
        sent: false,
      },
      {
        id: `reminder_3_${invoiceId}`,
        daysBeforeDue: 0,
        daysAfterDue: 0,
        type: 'email',
        template: 'Hi {{clientName}}, invoice {{invoiceNumber}} for {{amount}} {{currency}} is due today. Please complete your payment at your earliest convenience.',
        sent: false,
      },
      {
        id: `overdue_1_${invoiceId}`,
        daysBeforeDue: 0,
        daysAfterDue: 3,
        type: 'email',
        template: 'Hi {{clientName}}, invoice {{invoiceNumber}} for {{amount}} {{currency}} is now 3 days overdue. Please let us know if you have any questions about the payment.',
        sent: false,
      },
      {
        id: `overdue_2_${invoiceId}`,
        daysBeforeDue: 0,
        daysAfterDue: 7,
        type: 'email',
        template: 'Hi {{clientName}}, invoice {{invoiceNumber}} for {{amount}} {{currency}} is now 7 days overdue. This is a follow-up reminder to complete your payment.',
        sent: false,
      },
      {
        id: `overdue_3_${invoiceId}`,
        daysBeforeDue: 0,
        daysAfterDue: 14,
        type: 'email',
        template: 'Hi {{clientName}}, invoice {{invoiceNumber}} for {{amount}} {{currency}} is now 14 days overdue. Please contact us immediately to arrange payment.',
        sent: false,
      },
    ];

    // TODO: Save reminders to database
    return reminders;
  }

  async getSmartInvoice(userId: string, invoiceId: string): Promise<SmartInvoice> {
    const invoice = await this.prisma.freelanceInvoice.findFirst({
      where: { id: invoiceId, project: { userId } },
      include: { project: { include: { client: true } } },
    });

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    const qrCode = await this.generateQRCode(invoiceId);
    const paymentLinks = await this.generatePaymentLinks(userId, invoiceId);
    const smartReminders = await this.createSmartReminders(invoiceId);

    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber || invoice.id.slice(0, 8),
      amount: Number(invoice.amount),
      currency: invoice.currency,
      dueDate: invoice.dueDate || new Date(),
      clientName: invoice.project.client.name,
      projectName: invoice.project.name,
      status: invoice.status,
      qrCode,
      paymentLinks,
      smartReminders,
    };
  }

  async getUserPaymentMethods(userId: string): Promise<PaymentMethod[]> {
    // TODO: Get from database
    return [
      {
        id: 'pm_stripe_1',
        type: 'stripe',
        name: 'Stripe Credit Card',
        isActive: true,
        accountDetails: { accountId: 'acct_1234567890' },
        fees: { percentage: 2.9, fixed: 30, currency: 'USD' },
        processingTime: 'Instant',
      },
      {
        id: 'pm_paypal_1',
        type: 'paypal',
        name: 'PayPal Business',
        isActive: true,
        accountDetails: { email: 'business@example.com' },
        fees: { percentage: 3.4, fixed: 30, currency: 'USD' },
        processingTime: 'Instant',
      },
      {
        id: 'pm_bank_1',
        type: 'bank',
        name: 'Bank Transfer',
        isActive: true,
        accountDetails: {
          bankName: 'Chase Bank',
          accountNumber: '****1234',
          routingNumber: '****5678',
        },
        fees: { percentage: 0, fixed: 0, currency: 'USD' },
        processingTime: '1-3 days',
      },
    ];
  }

  async addPaymentMethod(userId: string, method: Omit<PaymentMethod, 'id'>): Promise<PaymentMethod> {
    // TODO: Save to database
    const newMethod: PaymentMethod = {
      ...method,
      id: `pm_${Date.now()}`,
    };
    return newMethod;
  }

  async updatePaymentMethod(userId: string, methodId: string, updates: Partial<PaymentMethod>): Promise<PaymentMethod> {
    // TODO: Update in database
    const methods = await this.getUserPaymentMethods(userId);
    const method = methods.find(m => m.id === methodId);
    if (!method) {
      throw new Error('Payment method not found');
    }
    return { ...method, ...updates };
  }

  async deletePaymentMethod(userId: string, methodId: string): Promise<void> {
    // TODO: Delete from database
    this.logger.logBusinessEvent('payment_method_deleted', userId, {
      methodId,
    });
  }

  async getPendingReminders(): Promise<Array<{
    invoiceId: string;
    reminderId: string;
    type: string;
    template: string;
    variables: Record<string, any>;
  }>> {
    // TODO: Get from database based on due dates
    const now = new Date();
    const reminders = [];

    // Mock logic - in production this would query database
    const invoices = await this.prisma.freelanceInvoice.findMany({
      where: { status: 'sent' },
      include: { project: { include: { client: true } } },
    });

    for (const invoice of invoices) {
      const dueDate = invoice.dueDate || invoice.createdAt;
      const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const daysOverdue = Math.ceil((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

      // Check for reminders that should be sent
      if (daysUntilDue === 7 || daysUntilDue === 3 || daysUntilDue === 0) {
        reminders.push({
          invoiceId: invoice.id,
          reminderId: `reminder_${daysUntilDue}_${invoice.id}`,
          type: 'email',
          template: `Reminder for invoice {{invoiceNumber}} due in ${daysUntilDue} days`,
          variables: {
            invoiceNumber: invoice.invoiceNumber || invoice.id.slice(0, 8),
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
            invoiceNumber: invoice.invoiceNumber || invoice.id.slice(0, 8),
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
    // TODO: Get invoice and reminder details
    const invoice = await this.prisma.freelanceInvoice.findFirst({
      where: { id: invoiceId },
      include: { project: { include: { client: true, user: true } } },
    });

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    // TODO: Send email using notification service
    this.logger.logBusinessEvent('invoice_reminder_sent', invoice.project.userId, {
      invoiceId,
      reminderId,
    });
  }

  private generateStripePaymentLink(invoice: any, method: PaymentMethod): string {
    // TODO: Generate actual Stripe payment link
    const baseUrl = 'https://checkout.stripe.com';
    return `${baseUrl}/pay?invoice=${invoice.id}&amount=${Number(invoice.amount) * 100}&currency=${invoice.currency}`;
  }

  private generatePayPalPaymentLink(invoice: any, method: PaymentMethod): string {
    // TODO: Generate actual PayPal payment link
    const baseUrl = 'https://www.paypal.com';
    return `${baseUrl}/pay?invoice=${invoice.id}&amount=${invoice.amount}&currency=${invoice.currency}`;
  }

  private generateWisePaymentLink(invoice: any, method: PaymentMethod): string {
    // TODO: Generate actual Wise payment link
    const baseUrl = 'https://wise.com';
    return `${baseUrl}/pay?invoice=${invoice.id}&amount=${invoice.amount}&currency=${invoice.currency}`;
  }

  private generateBankTransferDetails(invoice: any, method: PaymentMethod): string {
    // TODO: Generate bank transfer details page
    const baseUrl = process.env.FRONTEND_URL || 'https://app.rizzup.com';
    return `${baseUrl}/bank-transfer/${invoice.id}`;
  }

  private generateCryptoPaymentLink(invoice: any, method: PaymentMethod): string {
    // TODO: Generate crypto payment link
    const baseUrl = 'https://commerce.coinbase.com';
    return `${baseUrl}/checkout?invoice=${invoice.id}&amount=${invoice.amount}&currency=${invoice.currency}`;
  }
}
