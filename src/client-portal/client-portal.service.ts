import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { AuthService } from '../auth/auth.service';
import { AppLogger } from '../common/logger.service';
import { PrismaService } from '../prisma/prisma.service';
import { randomBytes } from 'crypto';

import {
  buildInvoicePdfBuffer,
  mapFreelanceInvoiceRowToPdfInput,
  normalizeInvoicePdfLocale,
  signInvoicePdfDownloadToken,
  verifyInvoicePdfDownloadToken,
} from '../freelance/invoice-pdf';

// Temporary storage for client portal tokens (in production, use Redis)
interface ClientPortalSession {
  clientId: string;
  freelancerId: string;
  permissions: string[];
  expiresAt: Date;
  token: string;
}

const clientPortalSessions = new Map<string, ClientPortalSession>();

export interface ClientPortalToken {
  clientId: string;
  freelancerId: string;
  permissions: string[];
  expiresAt: Date;
}

export interface ClientDashboard {
  freelancerInfo: {
    name: string;
    logo?: string;
    email: string;
  };
  quickActions: {
    activeProjects: number;
    pendingInvoices: number;
    pendingInvoicesAmount: number;
    recentDeliveries: number;
  };
  recentActivity: Array<{
    type: 'delivery' | 'invoice' | 'payment';
    title: string;
    date: string;
    status: string;
  }>;
}

export interface ClientProject {
  id: string;
  name: string;
  description?: string;
  status: string;
  createdAt: string;
  deadline?: string;
  progress: number;
  deliveries: Array<{
    id: string;
    title: string;
    description?: string;
    files: Array<{
      id: string;
      fileName: string;
      url: string;
      size: number;
    }>;
    deliveredAt: string;
    status: 'pending_review' | 'approved' | 'needs_changes';
    clientFeedback?: string | null;
  }>;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    amount: number;
    currency: string;
    dueDate: string;
    status: 'pending' | 'paid' | 'overdue';
    paymentLink?: string;
  }>;
}

@Injectable()
export class ClientPortalService {
  private readonly logger: AppLogger;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly auth: AuthService,
  ) {
    this.logger = new AppLogger(config);
  }

  async generateMagicLink(clientId: string, freelancerId: string, permissions: string[]): Promise<string> {
    // Generate secure token
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Store in memory (in production, use Redis/Database)
    clientPortalSessions.set(token, {
      clientId,
      freelancerId,
      permissions,
      expiresAt,
      token,
    });

    this.logger.logBusinessEvent('client_portal_magic_link_generated', freelancerId, {
      clientId,
      permissions,
      expiresAt,
    });

    return `${this.config.get('FRONTEND_URL')}/portal/invite/${token}`;
  }

  async validateMagicLink(token: string): Promise<ClientPortalToken> {
    const session = clientPortalSessions.get(token);

    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired portal link');
    }

    return {
      clientId: session.clientId,
      freelancerId: session.freelancerId,
      permissions: session.permissions,
      expiresAt: session.expiresAt,
    };
  }

  async generateClientToken(tokenData: ClientPortalToken): Promise<string> {
    return this.jwtService.sign(tokenData, {
      secret: this.config.get('JWT_CLIENT_SECRET'),
      expiresIn: '24h',
    });
  }

  async getClientDashboard(clientId: string, freelancerId: string): Promise<ClientDashboard> {
    // Get freelancer info
    const freelancer = await this.prisma.profile.findUnique({
      where: { id: freelancerId },
      select: {
        displayName: true,
        invoiceBrandLogoUrl: true,
        email: true,
      },
    });

    if (!freelancer) {
      throw new NotFoundException('Freelancer not found');
    }

    // Get client data
    const client = await this.prisma.freelanceClient.findUnique({
      where: { id: clientId },
      include: {
        projects: {
          where: { userId: freelancerId },
          include: {
            invoices: {
              where: { status: { not: 'draft' } },
              orderBy: { createdAt: 'desc' },
              take: 5,
            },
            deliveries: {
              orderBy: { createdAt: 'desc' },
              take: 5,
              include: { attachments: true },
            },
          },
        },
      },
    });

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    // Calculate quick actions
    const activeProjects = client.projects.filter(p => p.status !== 'completed').length;
    const pendingInvoices = client.projects
      .flatMap(p => p.invoices)
      .filter(i => i.status === 'sent' || i.status === 'viewed')
      .length;
    const pendingInvoicesAmount = client.projects
      .flatMap(p => p.invoices)
      .filter(i => i.status === 'sent' || i.status === 'viewed')
      .reduce((sum, i) => sum + Number(i.amount), 0);
    const recentDeliveries = client.projects
      .flatMap(p => p.deliveries)
      .filter(d => new Date(d.createdAt) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
      .length;

    // Build recent activity
    const recentActivity: Array<{
      type: 'delivery' | 'invoice' | 'payment';
      title: string;
      date: string;
      status: string;
    }> = [];
    
    // Add deliveries
    client.projects.forEach(project => {
      project.deliveries.forEach(delivery => {
        recentActivity.push({
          type: 'delivery',
          title: `New delivery: ${delivery.label}`,
          date: delivery.createdAt.toISOString(),
          status: delivery.status,
        });
      });
    });

    // Add invoices
    client.projects.forEach(project => {
      project.invoices.forEach(invoice => {
        recentActivity.push({
          type: 'invoice',
          title: `Invoice ${invoice.invoiceNumber || 'INV-' + invoice.id.slice(0, 8)}: ${invoice.currency} ${Number(invoice.amount)}`,
          date: invoice.createdAt.toISOString(),
          status: invoice.status,
        });
      });
    });

    // Sort by date and take latest 10
    recentActivity.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const latestActivity = recentActivity.slice(0, 10);

    return {
      freelancerInfo: {
        name: freelancer.displayName || 'Unknown',
        logo: freelancer.invoiceBrandLogoUrl || undefined,
        email: freelancer.email || 'no-email@example.com',
      },
      quickActions: {
        activeProjects,
        pendingInvoices,
        pendingInvoicesAmount,
        recentDeliveries,
      },
      recentActivity: latestActivity,
    };
  }

  async getClientProjects(clientId: string, freelancerId: string): Promise<ClientProject[]> {
    const projects = await this.prisma.freelanceProject.findMany({
      where: {
        clientId,
        userId: freelancerId,
      },
      include: {
        deliveries: {
          orderBy: { createdAt: 'desc' },
          include: { attachments: true },
        },
        invoices: {
          where: { status: { not: 'draft' } },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(
      projects.map(async (project) => ({
        id: project.id,
        name: project.name,
        description: project.description || undefined,
        status: project.status,
        createdAt: project.createdAt.toISOString(),
        deadline: project.deadline?.toISOString().split('T')[0],
        progress: this.calculateProjectProgress(project),
        deliveries: await Promise.all(
          project.deliveries.map((d) => this.toPortalDelivery(d)),
        ),
        invoices: project.invoices.map(invoice => ({
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber || `INV-${invoice.id.slice(0, 8)}`,
          amount: Number(invoice.amount),
          currency: invoice.currency,
          dueDate: invoice.dueDate?.toISOString().split('T')[0] || '',
          status: invoice.status as 'pending' | 'paid' | 'overdue',
          paymentLink: `${this.config.get('FRONTEND_URL')}/pay/${invoice.id}`,
        })),
      })),
    );
  }

  async getClientProject(clientId: string, freelancerId: string, projectId: string): Promise<ClientProject> {
    const project = await this.prisma.freelanceProject.findFirst({
      where: {
        id: projectId,
        clientId,
        userId: freelancerId,
      },
      include: {
        deliveries: {
          orderBy: { createdAt: 'desc' },
          include: { attachments: true },
        },
        invoices: {
          where: { status: { not: 'draft' } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return {
      id: project.id,
      name: project.name,
      description: project.description || undefined,
      status: project.status,
      createdAt: project.createdAt.toISOString(),
      deadline: project.deadline?.toISOString().split('T')[0],
      progress: this.calculateProjectProgress(project),
      deliveries: await Promise.all(
        project.deliveries.map((d) => this.toPortalDelivery(d)),
      ),
      invoices: project.invoices.map(invoice => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber || `INV-${invoice.id.slice(0, 8)}`,
        amount: Number(invoice.amount),
        currency: invoice.currency,
        dueDate: invoice.dueDate?.toISOString().split('T')[0] || '',
        status: invoice.status as 'pending' | 'paid' | 'overdue',
        paymentLink: `${this.config.get('FRONTEND_URL')}/pay/${invoice.id}`,
      })),
    };
  }

  async getClientInvoices(clientId: string, freelancerId: string): Promise<any[]> {
    const invoices = await this.prisma.freelanceInvoice.findMany({
      where: {
        project: {
          clientId,
          userId: freelancerId,
        },
        status: { not: 'draft' },
      },
      include: {
        project: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return invoices.map(invoice => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber || `INV-${invoice.id.slice(0, 8)}`,
      projectName: invoice.project.name,
      amount: Number(invoice.amount),
      currency: invoice.currency,
      dueDate: invoice.dueDate?.toISOString().split('T')[0] || '',
      status: invoice.status,
      createdAt: invoice.createdAt.toISOString().split('T')[0],
      paymentLink: `${this.config.get('FRONTEND_URL')}/pay/${invoice.id}`,
    }));
  }

  async updateDeliveryFeedback(
    clientId: string,
    freelancerId: string,
    deliveryId: string,
    feedback: string,
    status: 'approved' | 'needs_changes',
  ): Promise<void> {
    const delivery = await this.prisma.projectDelivery.findFirst({
      where: {
        id: deliveryId,
        project: {
          clientId,
          userId: freelancerId,
        },
      },
    });

    if (!delivery) {
      throw new NotFoundException('Delivery not found');
    }

    const dbStatus = status === 'approved' ? 'approved' : 'needs_changes';
    await this.prisma.projectDelivery.update({
      where: { id: deliveryId },
      data: {
        clientFeedback: feedback,
        status: dbStatus,
      },
    });

    this.logger.logBusinessEvent('client_feedback_updated', freelancerId, {
      clientId,
      deliveryId,
      status,
      feedback,
    });
  }

  /**
   * Short-lived JWT URL for PDF download (no Bearer header). Requires API_PUBLIC_URL for absolute links.
   */
  async createInvoicePdfDownloadLink(
    clientId: string,
    freelancerId: string,
    invoiceId: string,
  ): Promise<{ url: string; expiresAt: string }> {
    const base = (this.config.get<string>('API_PUBLIC_URL') ?? '').trim();
    if (!base) {
      throw new ServiceUnavailableException({
        message:
          'API_PUBLIC_URL is not set; cannot build a public PDF download URL for the client portal.',
      });
    }

    await this.assertClientOwnsInvoice(clientId, freelancerId, invoiceId);

    const secret =
      this.config.get<string>('JWT_CLIENT_SECRET') || 'client-portal-secret';
    const token = signInvoicePdfDownloadToken(
      { invoiceId, clientId, freelancerId },
      secret,
      1800,
    );
    const expiresAt = new Date(Date.now() + 1800_000).toISOString();
    const url = `${base.replace(/\/$/, '')}/portal/invoice-pdf?t=${encodeURIComponent(token)}`;
    return { url, expiresAt };
  }

  /** Validate JWT from `GET /portal/invoice-pdf?t=` and return PDF bytes. */
  async streamInvoicePdfFromDownloadToken(
    token: string,
    localeRaw?: string,
  ): Promise<Buffer> {
    const secret =
      this.config.get<string>('JWT_CLIENT_SECRET') || 'client-portal-secret';
    let payload: ReturnType<typeof verifyInvoicePdfDownloadToken>;
    try {
      payload = verifyInvoicePdfDownloadToken(token, secret);
    } catch {
      throw new UnauthorizedException('Invalid or expired download link');
    }

    const inv = await this.prisma.freelanceInvoice.findFirst({
      where: {
        id: payload.invoiceId,
        project: {
          clientId: payload.clientId,
          userId: payload.freelancerId,
        },
      },
      include: { project: { include: { client: true } }, payments: true },
    });
    if (!inv) {
      throw new NotFoundException('Invoice not found');
    }

    const profile = await this.prisma.profile.findUnique({
      where: { id: payload.freelancerId },
      select: {
        invoiceBrandName: true,
        invoiceBrandAddress: true,
        invoiceBrandFooter: true,
        invoiceIssuerTaxId: true,
        invoiceDocumentTemplate: true,
      },
    });

    const locale = normalizeInvoicePdfLocale(localeRaw);
    const input = mapFreelanceInvoiceRowToPdfInput(inv, profile);
    return buildInvoicePdfBuffer(input, locale);
  }

  private async assertClientOwnsInvoice(
    clientId: string,
    freelancerId: string,
    invoiceId: string,
  ): Promise<void> {
    const inv = await this.prisma.freelanceInvoice.findFirst({
      where: {
        id: invoiceId,
        project: { clientId, userId: freelancerId },
      },
      select: { id: true },
    });
    if (!inv) {
      throw new NotFoundException('Invoice not found');
    }
  }

  private async mapAttachmentsForPortal(
    attachments: Array<{
      id: string;
      fileName: string;
      objectPath: string;
      bucketId: string;
      sizeBytes: number | null;
      mimeType: string | null;
    }>,
  ): Promise<Array<{ id: string; fileName: string; url: string; size: number }>> {
    const out: Array<{ id: string; fileName: string; url: string; size: number }> = [];
    for (const a of attachments) {
      const signed = await this.auth.createSignedStorageUrl(
        a.bucketId || 'user-files',
        a.objectPath,
        3600,
      );
      out.push({
        id: a.id,
        fileName: a.fileName,
        url: signed ?? '',
        size: a.sizeBytes ?? 0,
      });
    }
    return out;
  }

  private async toPortalDelivery(delivery: {
    id: string;
    label: string;
    notes: string | null;
    status: string;
    clientFeedback: string | null;
    createdAt: Date;
    attachments: Array<{
      id: string;
      fileName: string;
      objectPath: string;
      bucketId: string;
      sizeBytes: number | null;
      mimeType: string | null;
    }>;
  }) {
    const files = await this.mapAttachmentsForPortal(delivery.attachments);
    return {
      id: delivery.id,
      title: delivery.label,
      description: delivery.notes || undefined,
      files,
      deliveredAt: delivery.createdAt.toISOString(),
      status: this.mapDeliveryStatusForPortal(delivery.status),
      clientFeedback: delivery.clientFeedback ?? undefined,
    };
  }

  private mapDeliveryStatusForPortal(
    status: string,
  ): 'pending_review' | 'approved' | 'needs_changes' {
    if (status === 'approved') return 'approved';
    if (status === 'needs_changes') return 'needs_changes';
    return 'pending_review';
  }

  private calculateProjectProgress(project: any): number {
    // Simple progress calculation based on status
    const statusWeights: Record<string, number> = {
      'draft': 0,
      'active': 25,
      'in_progress': 50,
      'review': 75,
      'completed': 100,
    };

    return statusWeights[project.status] || 0;
  }

  async deactivatePortalToken(token: string): Promise<void> {
    clientPortalSessions.delete(token);
  }
}
