import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateClientDto } from './dto/create-client.dto';
import type { CreateDeliveryDto } from './dto/create-delivery.dto';
import type { CreatePaymentDto } from './dto/create-payment.dto';
import type { CreateProjectDto } from './dto/create-project.dto';
import type { CreateQuickInvoiceDto } from './dto/create-quick-invoice.dto';
import type { CreateQuoteDto } from './dto/create-quote.dto';
import type { PatchClientDto } from './dto/patch-client.dto';
import type { PatchInvoiceDto } from './dto/patch-invoice.dto';
import type { PatchProjectDto } from './dto/patch-project.dto';
import type { PatchQuoteDto } from './dto/patch-quote.dto';
import type { SendInvoiceEmailDto } from './dto/send-invoice-email.dto';
import {
  buildInvoicePdfBuffer,
  mapFreelanceInvoiceRowToPdfInput,
  normalizeInvoicePdfLocale,
  signInvoicePdfDownloadToken,
} from './invoice-pdf';
import { buildQuotePdfBuffer, type QuotePdfInput } from './quote-pdf';
import { consumeNextInvoiceNumber, type ProfilePdfSlice } from '@rizzup/invoice-settings';

const INVOICE_PENDING = ['sent', 'viewed'] as const;

@Injectable()
export class FreelanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async summary(userId: string) {
    const [clientCount, invoiceRows] = await Promise.all([
      this.prisma.freelanceClient.count({ where: { userId } }),
      this.prisma.freelanceInvoice.findMany({
        where: { project: { userId } },
        include: {
          project: { include: { client: true } },
          payments: true,
        },
      }),
    ]);

    // Calculate total income (paid invoices)
    const totalIncome = invoiceRows
      .filter(inv => inv.status === 'paid')
      .reduce((sum, inv) => {
        const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
        return sum + paid;
      }, 0);

    // Calculate pending payments
    const pendingPayments = invoiceRows
      .filter(inv => INVOICE_PENDING.includes(inv.status as (typeof INVOICE_PENDING)[number]))
      .reduce((sum, inv) => {
        const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
        const balance = Number(inv.amount) - paid;
        return sum + Math.max(0, balance);
      }, 0);

    // Count overdue invoices
    const overdueCount = invoiceRows.filter(inv => {
      if (!INVOICE_PENDING.includes(inv.status as (typeof INVOICE_PENDING)[number])) {
        return false;
      }
      const due = inv.dueDate || inv.createdAt;
      return Date.now() > due.getTime();
    }).length;

    return {
      totalIncome,
      pendingPayments,
      clientCount,
      overdueCount,
    };
  }

  async listClients(userId: string) {
    return this.prisma.freelanceClient.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
    });
  }

  async createClient(userId: string, dto: CreateClientDto) {
    const existing = await this.prisma.freelanceClient.findFirst({
      where: { userId, email: dto.email },
    });
    if (existing) {
      throw new BadRequestException({ code: 'CLIENT_EMAIL_EXISTS' });
    }
    return this.prisma.freelanceClient.create({
      data: { ...dto, userId },
    });
  }

  async patchClient(userId: string, id: string, dto: PatchClientDto) {
    const c = await this.prisma.freelanceClient.findFirst({
      where: { id, userId },
    });
    if (!c) throw new NotFoundException({ code: 'CLIENT_NOT_FOUND' });
    return this.prisma.freelanceClient.update({
      where: { id },
      data: dto as any,
    });
  }

  async deleteClient(userId: string, id: string) {
    const c = await this.prisma.freelanceClient.findFirst({
      where: { id, userId },
    });
    if (!c) throw new NotFoundException({ code: 'CLIENT_NOT_FOUND' });
    return this.prisma.freelanceClient.delete({ where: { id } });
  }

  async listProjects(userId: string) {
    return this.prisma.freelanceProject.findMany({
      where: { userId },
      include: { client: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createProject(userId: string, dto: CreateProjectDto) {
    const client = await this.prisma.freelanceClient.findFirst({
      where: { id: dto.clientId, userId },
    });
    if (!client) throw new NotFoundException({ code: 'CLIENT_NOT_FOUND' });
    return this.prisma.freelanceProject.create({
      data: { ...dto, userId, status: 'active' } as any,
      include: { client: true },
    });
  }

  async getProject(userId: string, id: string) {
    const p = await this.prisma.freelanceProject.findFirst({
      where: { id, userId },
      include: { client: true },
    });
    if (!p) throw new NotFoundException({ code: 'PROJECT_NOT_FOUND' });
    return p;
  }

  async patchProject(userId: string, id: string, dto: PatchProjectDto) {
    const p = await this.prisma.freelanceProject.findFirst({
      where: { id, userId },
    });
    if (!p) throw new NotFoundException({ code: 'PROJECT_NOT_FOUND' });
    return this.prisma.freelanceProject.update({
      where: { id },
      data: dto,
      include: { client: true },
    });
  }

  async deleteProject(userId: string, id: string) {
    const p = await this.prisma.freelanceProject.findFirst({
      where: { id, userId },
    });
    if (!p) throw new NotFoundException({ code: 'PROJECT_NOT_FOUND' });
    return this.prisma.freelanceProject.delete({ where: { id } });
  }

  async listInvoices(userId: string) {
    return this.prisma.freelanceInvoice.findMany({
      where: { project: { userId } },
      include: { project: { include: { client: true } }, payments: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createQuickInvoice(userId: string, dto: CreateQuickInvoiceDto) {
    const project = await this.prisma.freelanceProject.findFirst({
      where: { id: dto.projectId, userId },
      include: { client: true },
    });
    if (!project) throw new NotFoundException({ code: 'PROJECT_NOT_FOUND' });

    const issueDate = new Date();

    return this.prisma.$transaction(async (tx) => {
      const profile = await tx.profile.findUnique({ where: { id: userId } });
      const numberingJson = profile?.invoiceNumbering ?? null;
      const auto = consumeNextInvoiceNumber(numberingJson, issueDate);
      const invoiceNumber = auto?.invoiceNumber ?? null;

      if (auto) {
        await tx.profile.update({
          where: { id: userId },
          data: { invoiceNumbering: auto.updatedState as object },
        });
      }

      const inv = await tx.freelanceInvoice.create({
        data: {
          invoiceNumber,
          amount: dto.amountCents / 100,
          currency: dto.currency || 'EUR',
          status: 'draft',
          projectId: dto.projectId,
          memo: dto.title,
        } as any,
        include: { project: { include: { client: true } }, payments: true },
      });

      return inv;
    });
  }

  async patchInvoice(userId: string, id: string, dto: PatchInvoiceDto) {
    const inv = await this.prisma.freelanceInvoice.findFirst({
      where: { id, project: { userId } },
    });
    if (!inv) throw new NotFoundException({ code: 'INVOICE_NOT_FOUND' });

    const data: Record<string, unknown> = {};
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.memo !== undefined) data.memo = dto.memo;
    if (dto.dueDate !== undefined) {
      data.dueDate = dto.dueDate === null ? null : new Date(dto.dueDate);
    }
    if (dto.invoiceNumber !== undefined) data.invoiceNumber = dto.invoiceNumber;
    if (dto.lineItems !== undefined) data.lineItems = dto.lineItems;
    if (dto.taxBreakdown !== undefined) {
      if (dto.taxBreakdown === null) data.taxBreakdown = null;
      else if (Array.isArray(dto.taxBreakdown)) data.taxBreakdown = dto.taxBreakdown;
    }

    return this.prisma.freelanceInvoice.update({
      where: { id },
      data: data as any,
      include: { project: { include: { client: true } }, payments: true },
    });
  }

  async invoicePdfBuffer(
    userId: string,
    invoiceId: string,
    localeRaw?: string,
  ): Promise<Buffer> {
    const inv = await this.prisma.freelanceInvoice.findFirst({
      where: { id: invoiceId, project: { userId } },
      include: { project: { include: { client: true } }, payments: true },
    });
    if (!inv) throw new NotFoundException({ code: 'INVOICE_NOT_FOUND' });

    const profile = await this.selectProfilePdfSlice(inv.project.userId);

    const locale = normalizeInvoicePdfLocale(localeRaw);
    const input = mapFreelanceInvoiceRowToPdfInput(inv, profile);
    return buildInvoicePdfBuffer(input, locale);
  }

  private async selectProfilePdfSlice(userId: string): Promise<ProfilePdfSlice | null> {
    const p = await this.prisma.profile.findUnique({
      where: { id: userId },
      select: {
        invoiceBrandName: true,
        invoiceBrandAddress: true,
        invoiceBrandFooter: true,
        invoiceIssuerTaxId: true,
        invoiceDocumentTemplate: true,
      },
    });
    return p;
  }

  async sendInvoiceEmail(userId: string, invoiceId: string, dto: SendInvoiceEmailDto) {
    const inv = await this.prisma.freelanceInvoice.findFirst({
      where: { id: invoiceId, project: { userId } },
      include: { project: { include: { client: true } }, payments: true },
    });
    if (!inv) throw new NotFoundException({ code: 'INVOICE_NOT_FOUND' });

    const apiKey = process.env.RESEND_API_KEY;
    const from =
      process.env.RESEND_FROM_EMAIL ||
      process.env.RESEND_FROM ||
      'noreply@rizzup.app';

    if (!apiKey) {
      throw new ServiceUnavailableException({
        code: 'RESEND_NOT_CONFIGURED',
        message: 'RESEND_API_KEY not configured',
      });
    }

    const to = (dto.to?.trim() || inv.project.client.email?.trim() || '').trim();
    if (!to) {
      throw new BadRequestException({
        code: 'INVOICE_EMAIL_NO_RECIPIENT',
        message: 'Add a client email or pass `to` in the request body.',
      });
    }

    const locale = normalizeInvoicePdfLocale(dto.locale);
    const profile = await this.selectProfilePdfSlice(inv.project.userId);
    const pdfInput = mapFreelanceInvoiceRowToPdfInput(inv, profile);
    const pdfBuffer = await buildInvoicePdfBuffer(pdfInput, locale);
    const pdfBase64 = pdfBuffer.toString('base64');
    const fileName = `invoice-${(inv.invoiceNumber ?? inv.id.slice(0, 8)).replace(/[^\w.-]+/g, '_')}.pdf`;

    const secret =
      this.config.get<string>('JWT_CLIENT_SECRET') || 'client-portal-secret';
    const apiPublic = (this.config.get<string>('API_PUBLIC_URL') ?? '').trim();
    let downloadUrlHtml = '';
    if (apiPublic) {
      const token = signInvoicePdfDownloadToken(
        {
          invoiceId: inv.id,
          clientId: inv.project.clientId,
          freelancerId: inv.project.userId,
        },
        secret,
        1800,
      );
      const url = `${apiPublic.replace(/\/$/, '')}/portal/invoice-pdf?t=${encodeURIComponent(token)}${locale === 'es' ? '&locale=es' : '&locale=en'}`;
      downloadUrlHtml =
        locale === 'es'
          ? `<p><a href="${url}">Descargar factura (PDF, enlace temporal)</a></p>`
          : `<p><a href="${url}">Download invoice (PDF, temporary link)</a></p>`;
    }

    const amountCents = Math.round(Number(inv.amount) * 100);
    const subject =
      locale === 'es'
        ? `Factura ${inv.invoiceNumber ?? inv.id.slice(0, 8)} — ${inv.project.client.name}`
        : `Invoice ${inv.invoiceNumber ?? inv.id.slice(0, 8)} — ${inv.project.client.name}`;
    const safe = (s: string) =>
      s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    const greeting =
      locale === 'es'
        ? `<p>Hola ${safe(inv.project.client.name)},</p>
<p>Adjuntamos el PDF de la factura y un resumen:</p>`
        : `<p>Hi ${safe(inv.project.client.name)},</p>
<p>Please find your invoice PDF attached and a short summary below:</p>`;
    const html = `${greeting}
<ul>
  <li><strong>${locale === 'es' ? 'Proyecto' : 'Project'}:</strong> ${safe(inv.project.name)}</li>
  <li><strong>${locale === 'es' ? 'Importe' : 'Amount'}:</strong> ${safe(inv.currency)} ${(amountCents / 100).toFixed(2)}</li>
  <li><strong>${locale === 'es' ? 'Estado' : 'Status'}:</strong> ${safe(inv.status)}</li>
</ul>
<p>${safe(inv.memo ?? '')}</p>
${downloadUrlHtml}
<p>${locale === 'es' ? 'Gracias.' : 'Thanks,'}<br/>${locale === 'es' ? 'Tu freelance' : 'Your freelancer'}</p>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        html,
        attachments: [{ filename: fileName, content: pdfBase64 }],
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new ServiceUnavailableException({
        code: 'RESEND_SEND_FAILED',
        message: text || `Resend HTTP ${res.status}`,
      });
    }

    await this.prisma.freelanceInvoice.update({
      where: { id: invoiceId },
      data: { lastEmailedAt: new Date() },
    });

    return { ok: true as const, to };
  }

  async listPayments(userId: string, invoiceId: string) {
    const inv = await this.prisma.freelanceInvoice.findFirst({
      where: { id: invoiceId, project: { userId } },
    });
    if (!inv) throw new NotFoundException({ code: 'INVOICE_NOT_FOUND' });
    return this.prisma.invoicePayment.findMany({
      where: { invoiceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async recordPayment(
    userId: string,
    invoiceId: string,
    dto: CreatePaymentDto,
    idempotencyKeyHeader?: string,
  ) {
    const fromHeader = idempotencyKeyHeader?.trim();
    const fromBody = dto.idempotencyKey?.trim();
    const idempotencyKey = (fromHeader || fromBody) || undefined;
    if (idempotencyKey && idempotencyKey.length > 255) {
      throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_TOO_LONG' });
    }

    const inv = await this.prisma.freelanceInvoice.findFirst({
      where: { id: invoiceId, project: { userId } },
      include: { payments: true },
    });
    if (!inv) throw new NotFoundException({ code: 'INVOICE_NOT_FOUND' });

    if (idempotencyKey) {
      const existing = await this.prisma.invoicePayment.findFirst({
        where: { invoiceId, idempotencyKey },
      });
      if (existing) {
        const existingCents = Math.round(Number(existing.amount) * 100);
        if (existingCents !== dto.amountCents) {
          throw new ConflictException({ code: 'IDEMPOTENCY_KEY_MISMATCH' });
        }
        return existing;
      }
    }

    const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
    const newTotal = paid + (dto.amountCents / 100);
    const balance = Number(inv.amount) - newTotal;

    const payment = await this.prisma.invoicePayment.create({
      data: {
        invoiceId,
        amount: dto.amountCents / 100,
        note: dto.note,
        idempotencyKey: idempotencyKey ?? null,
      },
    });

    if (balance <= 0) {
      await this.prisma.freelanceInvoice.update({
        where: { id: invoiceId },
        data: { status: 'paid' },
      });
    }

    return payment;
  }

  async listQuotes(userId: string) {
    return this.prisma.quote.findMany({
      where: { userId },
      include: { client: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createQuote(userId: string, dto: CreateQuoteDto) {
    const client = await this.prisma.freelanceClient.findFirst({
      where: { id: dto.clientId, userId },
    });
    if (!client) throw new NotFoundException({ code: 'CLIENT_NOT_FOUND' });
    return this.prisma.quote.create({
      data: {
        userId,
        clientId: dto.clientId,
        title: dto.title,
        amount: dto.amountCents / 100,
        currency: dto.currency,
        status: dto.status ?? 'draft',
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        scopeNotes: dto.scopeNotes ?? null,
      } as any,
      include: { client: true },
    });
  }

  async patchQuote(userId: string, id: string, dto: PatchQuoteDto) {
    const q = await this.prisma.quote.findFirst({ where: { id, userId } });
    if (!q) throw new NotFoundException({ code: 'QUOTE_NOT_FOUND' });
    const data: Record<string, unknown> = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.amountCents !== undefined) data.amount = dto.amountCents / 100;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.validUntil !== undefined) {
      data.validUntil = dto.validUntil === null ? null : new Date(dto.validUntil);
    }
    if (dto.scopeNotes !== undefined) data.scopeNotes = dto.scopeNotes;
    return this.prisma.quote.update({
      where: { id },
      data: data as any,
      include: { client: true },
    });
  }

  async convertQuoteToInvoice(userId: string, quoteId: string) {
    const quote = await this.prisma.quote.findFirst({
      where: { id: quoteId, userId },
      include: { client: true },
    });
    if (!quote) throw new NotFoundException({ code: 'QUOTE_NOT_FOUND' });

    const issueDate = new Date();

    return this.prisma.$transaction(async (tx) => {
      const project = await tx.freelanceProject.create({
        data: {
          userId,
          clientId: quote.clientId,
          name: quote.title.slice(0, 200) || 'Project',
          status: 'active',
          description: quote.scopeNotes ?? undefined,
        } as any,
        include: { client: true },
      });

      const profile = await tx.profile.findUnique({ where: { id: userId } });
      const auto = consumeNextInvoiceNumber(profile?.invoiceNumbering ?? null, issueDate);
      const invoiceNumber = auto?.invoiceNumber ?? null;
      if (auto) {
        await tx.profile.update({
          where: { id: userId },
          data: { invoiceNumbering: auto.updatedState as object },
        });
      }

      const invoice = await tx.freelanceInvoice.create({
        data: {
          projectId: project.id,
          amount: Number(quote.amount),
          currency: quote.currency,
          status: 'draft',
          invoiceNumber,
          memo: `Converted from quote ${quote.id.slice(0, 8)}`,
        } as any,
        include: { project: { include: { client: true } }, payments: true },
      });

      await tx.quote.update({
        where: { id: quoteId },
        data: { status: 'accepted' } as any,
      });

      return { ok: true as const, projectId: project.id, invoice };
    });
  }

  async quotePdfBuffer(userId: string, quoteId: string, localeRaw?: string): Promise<Buffer> {
    const q = await this.prisma.quote.findFirst({
      where: { id: quoteId, userId },
      include: { client: true },
    });
    if (!q) throw new NotFoundException({ code: 'QUOTE_NOT_FOUND' });

    const locale = normalizeInvoicePdfLocale(localeRaw);
    const input: QuotePdfInput = {
      title: q.title,
      currency: q.currency,
      amountMajor: Number(q.amount),
      status: q.status,
      validUntil: q.validUntil,
      scopeNotes: q.scopeNotes,
      clientName: q.client.name,
      clientEmail: q.client.email,
      createdAt: q.createdAt,
    };
    return buildQuotePdfBuffer(input, locale);
  }

  async listDeliveries(userId: string, projectId: string) {
    const project = await this.prisma.freelanceProject.findFirst({
      where: { id: projectId, userId },
    });
    if (!project) throw new NotFoundException({ code: 'PROJECT_NOT_FOUND' });
    return this.prisma.projectDelivery.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createDelivery(userId: string, projectId: string, dto: CreateDeliveryDto) {
    const project = await this.prisma.freelanceProject.findFirst({
      where: { id: projectId, userId },
    });
    if (!project) throw new NotFoundException({ code: 'PROJECT_NOT_FOUND' });
    return this.prisma.projectDelivery.create({
      data: { ...dto, projectId },
    });
  }

  // Finance Overview - comprehensive financial summary
  async financeOverview(userId: string) {
    const [invoices, projects, budgetExpenses] = await Promise.all([
      this.prisma.freelanceInvoice.findMany({
        where: { project: { userId } },
        include: { project: true, payments: true },
      }),
      this.prisma.freelanceProject.findMany({
        where: { userId },
        include: { client: true },
      }),
      this.prisma.personalBudgetExpense.findMany({
        where: { userId, isActive: true },
      }),
    ]);

    // Calculate receivables (pending invoices)
    const receivables = invoices.filter(inv =>
      ['sent', 'viewed'].includes(inv.status)
    );
    const receivablesCents = receivables.reduce((sum, inv) => {
      const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
      return sum + Math.round((Number(inv.amount) - paid) * 100);
    }, 0);

    // Calculate pipeline (proposed projects)
    const pipelineProjects = projects.filter(p =>
      ['proposed', 'negotiating'].includes(p.status)
    );
    const pipelineProjectCents = pipelineProjects.reduce((sum, p) =>
      sum + Math.round(Number(p.value || 0) * 100), 0
    );

    // Monthly fixed expenses
    const monthlyFixedCents = budgetExpenses.reduce((sum, exp) =>
      sum + Math.round(Number(exp.amount) * 100), 0
    );

    // Currency analysis (only from invoices and budget expenses - projects don't have currency field)
    const currencies = new Set([
      ...invoices.map(i => i.currency),
      ...budgetExpenses.map(e => e.currency),
    ]);
    const primaryCurrency = currencies.size === 1 ? Array.from(currencies)[0] : 'EUR';
    const mixedCurrency = currencies.size > 1;

    // Breakdown by currency
    const breakdown = {
      receivables: {} as Record<string, number>,
      pipeline: {} as Record<string, number>,
      monthlyFixed: {} as Record<string, number>,
    };

    receivables.forEach(inv => {
      const amount = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
      const balance = Math.round((Number(inv.amount) - amount) * 100);
      breakdown.receivables[inv.currency] = (breakdown.receivables[inv.currency] || 0) + balance;
    });

    pipelineProjects.forEach(p => {
      const ccy = primaryCurrency;
      breakdown.pipeline[ccy] = (breakdown.pipeline[ccy] || 0) + Math.round(Number(p.value || 0) * 100);
    });

    budgetExpenses.forEach(exp => {
      breakdown.monthlyFixed[exp.currency] = (breakdown.monthlyFixed[exp.currency] || 0) + Math.round(Number(exp.amount) * 100);
    });

    // Notional calculation
    const totalExpectedCents = receivablesCents + pipelineProjectCents;
    const notionalIfCollectedCents = totalExpectedCents - monthlyFixedCents;

    return {
      receivablesCents,
      pipelineProjectCents,
      monthlyFixedCents,
      totalExpectedCents,
      notionalIfCollectedCents,
      currency: primaryCurrency,
      mixedCurrency,
      breakdown: mixedCurrency ? breakdown : undefined,
    };
  }

  // Budget Expenses CRUD
  async listBudgetExpenses(userId: string) {
    return this.prisma.personalBudgetExpense.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createBudgetExpense(userId: string, dto: any) {
    return this.prisma.personalBudgetExpense.create({
      data: {
        userId,
        label: dto.label,
        category: dto.category || 'other',
        amount: dto.amountCents ? dto.amountCents / 100 : dto.amount,
        currency: dto.currency || 'EUR',
        isActive: true,
        notes: dto.notes,
      },
    });
  }

  async patchBudgetExpense(userId: string, id: string, dto: any) {
    const expense = await this.prisma.personalBudgetExpense.findFirst({
      where: { id, userId },
    });
    if (!expense) throw new NotFoundException({ code: 'EXPENSE_NOT_FOUND' });

    const data: any = { ...dto };
    if (dto.amountCents !== undefined) {
      data.amount = dto.amountCents / 100;
      delete data.amountCents;
    }

    return this.prisma.personalBudgetExpense.update({
      where: { id },
      data,
    });
  }

  async deleteBudgetExpense(userId: string, id: string) {
    const expense = await this.prisma.personalBudgetExpense.findFirst({
      where: { id, userId },
    });
    if (!expense) throw new NotFoundException({ code: 'EXPENSE_NOT_FOUND' });
    return this.prisma.personalBudgetExpense.delete({ where: { id } });
  }

  // Pulse - quick activity feed
  async pulse(userId: string) {
    const [recentInvoices, recentProjects, recentDeliveries] = await Promise.all([
      this.prisma.freelanceInvoice.findMany({
        where: { project: { userId } },
        include: { project: { include: { client: true } } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.prisma.freelanceProject.findMany({
        where: { userId },
        include: { client: true },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }),
      this.prisma.projectDelivery.findMany({
        where: { project: { userId } },
        include: { project: { include: { client: true } } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    return {
      recentActivity: [
        ...recentInvoices.map(inv => ({
          type: 'invoice',
          id: inv.id,
          title: `Invoice ${inv.invoiceNumber || inv.id.slice(0, 8)}`,
          status: inv.status,
          clientName: inv.project.client.name,
          date: inv.createdAt,
          amount: Number(inv.amount),
          currency: inv.currency,
        })),
        ...recentProjects.map(proj => ({
          type: 'project',
          id: proj.id,
          title: proj.name,
          status: proj.status,
          clientName: proj.client.name,
          date: proj.updatedAt,
        })),
        ...recentDeliveries.map(del => ({
          type: 'delivery',
          id: del.id,
          title: del.label,
          status: del.status,
          projectName: del.project.name,
          clientName: del.project.client.name,
          date: del.createdAt,
        })),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10),
    };
  }

  // Duplicate project
  async duplicateProject(userId: string, projectId: string) {
    const project = await this.prisma.freelanceProject.findFirst({
      where: { id: projectId, userId },
      include: { client: true },
    });
    if (!project) throw new NotFoundException({ code: 'PROJECT_NOT_FOUND' });

    const newProject = await this.prisma.freelanceProject.create({
      data: {
        userId,
        clientId: project.clientId,
        name: `${project.name} (Copy)`,
        status: 'proposed',
        description: project.description,
        value: project.value,
      },
    });

    return newProject;
  }

  // Client Activities
  async listClientActivities(userId: string, clientId: string) {
    const client = await this.prisma.freelanceClient.findFirst({
      where: { id: clientId, userId },
    });
    if (!client) throw new NotFoundException({ code: 'CLIENT_NOT_FOUND' });

    return this.prisma.clientActivity.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async createClientActivity(userId: string, clientId: string, dto: any) {
    const client = await this.prisma.freelanceClient.findFirst({
      where: { id: clientId, userId },
    });
    if (!client) throw new NotFoundException({ code: 'CLIENT_NOT_FOUND' });

    return this.prisma.clientActivity.create({
      data: {
        userId,
        clientId,
        kind: dto.kind || 'note',
        title: dto.title,
        body: dto.body,
        metadata: dto.metadata || {},
      },
    });
  }

  // Client Timeline
  async clientTimeline(userId: string, clientId: string) {
    const client = await this.prisma.freelanceClient.findFirst({
      where: { id: clientId, userId },
    });
    if (!client) throw new NotFoundException({ code: 'CLIENT_NOT_FOUND' });

    const [projects, invoices, activities] = await Promise.all([
      this.prisma.freelanceProject.findMany({
        where: { clientId, userId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.freelanceInvoice.findMany({
        where: { project: { clientId, userId } },
        include: { project: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.clientActivity.findMany({
        where: { clientId, userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    const items = [
      ...projects.map(p => ({
        type: 'project_created',
        date: p.createdAt,
        title: `Project created: ${p.name}`,
        status: p.status,
      })),
      ...invoices.map(inv => ({
        type: 'invoice_created',
        date: inv.createdAt,
        title: `Invoice created: ${inv.invoiceNumber || inv.id.slice(0, 8)}`,
        status: inv.status,
        amount: Number(inv.amount),
        currency: inv.currency,
      })),
      ...activities.map(act => ({
        type: 'activity',
        date: act.createdAt,
        title: act.title,
        kind: act.kind,
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return { clientId, items };
  }

  // Project Timeline
  async projectTimeline(userId: string, projectId: string) {
    const project = await this.prisma.freelanceProject.findFirst({
      where: { id: projectId, userId },
      include: { client: true },
    });
    if (!project) throw new NotFoundException({ code: 'PROJECT_NOT_FOUND' });

    const [invoices, deliveries] = await Promise.all([
      this.prisma.freelanceInvoice.findMany({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.projectDelivery.findMany({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const items = [
      {
        type: 'project_created',
        date: project.createdAt,
        title: 'Project created',
        status: project.status,
      },
      ...invoices.map(inv => ({
        type: 'invoice_created',
        date: inv.createdAt,
        title: `Invoice: ${inv.invoiceNumber || inv.id.slice(0, 8)}`,
        status: inv.status,
        amount: Number(inv.amount),
        currency: inv.currency,
      })),
      ...deliveries.map(del => ({
        type: 'delivery_submitted',
        date: del.createdAt,
        title: `Delivery: ${del.label}`,
        status: del.status,
        version: del.version,
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return {
      projectId,
      client: { id: project.client.id, name: project.client.name },
      items,
    };
  }

  // Saved Briefs
  async listSavedBriefs(userId: string) {
    return this.prisma.savedBrief.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createSavedBrief(userId: string, dto: any) {
    return this.prisma.savedBrief.create({
      data: {
        userId,
        clientId: dto.clientId,
        projectId: dto.projectId,
        title: dto.title,
        content: dto.content,
        aiSummary: dto.aiSummary,
      },
    });
  }

  // Exports
  async exportBundle(userId: string) {
    const [clients, projects, invoices] = await Promise.all([
      this.prisma.freelanceClient.findMany({ where: { userId } }),
      this.prisma.freelanceProject.findMany({
        where: { userId },
        include: { client: true },
      }),
      this.prisma.freelanceInvoice.findMany({
        where: { project: { userId } },
        include: { project: { include: { client: true } }, payments: true },
      }),
    ]);

    const bundle = {
      exportedAt: new Date().toISOString(),
      clients: clients.map(c => ({
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
      })),
      projects: projects.map(p => ({
        id: p.id,
        name: p.name,
        clientName: p.client.name,
        status: p.status,
        value: Number(p.value),
      })),
      invoices: invoices.map(inv => ({
        id: inv.id,
        number: inv.invoiceNumber,
        clientName: inv.project.client.name,
        amount: Number(inv.amount),
        status: inv.status,
        paidAmount: inv.payments.reduce((s, p) => s + Number(p.amount), 0),
      })),
    };

    return Buffer.from(JSON.stringify(bundle, null, 2));
  }

  async exportCsv(userId: string): Promise<string> {
    const invoices = await this.prisma.freelanceInvoice.findMany({
      where: { project: { userId } },
      include: { project: { include: { client: true } }, payments: true },
    });

    const headers = ['Invoice ID', 'Number', 'Client', 'Amount', 'Currency', 'Status', 'Date', 'Paid'];
    const rows = invoices.map(inv => [
      inv.id,
      inv.invoiceNumber || '',
      inv.project.client.name,
      Number(inv.amount).toString(),
      inv.currency,
      inv.status,
      inv.createdAt.toISOString(),
      inv.payments.reduce((s, p) => s + Number(p.amount), 0).toString(),
    ]);

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }
}
