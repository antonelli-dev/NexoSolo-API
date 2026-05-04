import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface InvoiceTemplate {
  id: string;
  name: string;
  description: string;
  category: 'invoice' | 'proposal' | 'contract' | 'email';
  price: number;
  creatorId: string;
  creator: {
    id: string;
    name: string;
    avatar?: string;
  };
  preview: string;
  fileUrl: string;
  rating: number;
  downloads: number;
  customizable: boolean;
  tags: string[];
  createdAt: Date;
  isPremium: boolean;
}

export interface TemplatePurchase {
  id: string;
  templateId: string;
  userId: string;
  purchaseDate: Date;
  amount: number;
  status: 'completed' | 'pending' | 'refunded';
}

@Injectable()
export class MarketplaceService {
  constructor(private prisma: PrismaService) {}

  async getTemplates(category?: string, search?: string, isPremium?: boolean): Promise<InvoiceTemplate[]> {
    // Mock templates focused on invoices and proposals
    const mockTemplates: InvoiceTemplate[] = [
      {
        id: 'invoice-basic',
        name: 'Factura Básica Profesional',
        description: 'Plantilla de factura limpia y profesional para freelancers',
        category: 'invoice',
        price: 0,
        creatorId: 'rizzup',
        creator: {
          id: 'rizzup',
          name: 'RizzUp Team',
          avatar: 'https://example.com/rizzup-logo.png'
        },
        preview: 'https://example.com/preview-invoice-basic.jpg',
        fileUrl: 'https://example.com/template-invoice-basic.pdf',
        rating: 4.7,
        downloads: 1250,
        customizable: true,
        tags: ['factura', 'básico', 'profesional', 'freelancer'],
        createdAt: new Date('2024-01-15'),
        isPremium: false
      },
      {
        id: 'invoice-detailed',
        name: 'Factura Detallada con Items',
        description: 'Plantilla de factura con desglose de items y horas trabajadas',
        category: 'invoice',
        price: 4.99,
        creatorId: 'rizzup',
        creator: {
          id: 'rizzup',
          name: 'RizzUp Team',
          avatar: 'https://example.com/rizzup-logo.png'
        },
        preview: 'https://example.com/preview-invoice-detailed.jpg',
        fileUrl: 'https://example.com/template-invoice-detailed.pdf',
        rating: 4.8,
        downloads: 890,
        customizable: true,
        tags: ['factura', 'detallada', 'items', 'horas'],
        createdAt: new Date('2024-01-20'),
        isPremium: true
      },
      {
        id: 'proposal-web',
        name: 'Propuesta Web Completa',
        description: 'Plantilla de propuesta para proyectos web con secciones completas',
        category: 'proposal',
        price: 9.99,
        creatorId: 'creator1',
        creator: {
          id: 'creator1',
          name: 'Juan Developer',
          avatar: 'https://example.com/avatar1.jpg'
        },
        preview: 'https://example.com/preview-proposal-web.jpg',
        fileUrl: 'https://example.com/template-proposal-web.pdf',
        rating: 4.9,
        downloads: 567,
        customizable: true,
        tags: ['propuesta', 'web', 'completa', 'proyecto'],
        createdAt: new Date('2024-02-01'),
        isPremium: true
      },
      {
        id: 'contract-freelance',
        name: 'Contrato Freelancer Estándar',
        description: 'Plantilla de contrato legal para freelancers',
        category: 'contract',
        price: 14.99,
        creatorId: 'creator2',
        creator: {
          id: 'creator2',
          name: 'Maria Legal',
          avatar: 'https://example.com/avatar2.jpg'
        },
        preview: 'https://example.com/preview-contract.jpg',
        fileUrl: 'https://example.com/template-contract.pdf',
        rating: 4.9,
        downloads: 423,
        customizable: true,
        tags: ['contrato', 'legal', 'freelancer', 'estándar'],
        createdAt: new Date('2024-02-10'),
        isPremium: true
      },
      {
        id: 'email-followup',
        name: 'Email de Follow-up Profesional',
        description: 'Plantillas de email para seguimiento de pagos y clientes',
        category: 'email',
        price: 2.99,
        creatorId: 'rizzup',
        creator: {
          id: 'rizzup',
          name: 'RizzUp Team',
          avatar: 'https://example.com/rizzup-logo.png'
        },
        preview: 'https://example.com/preview-email.jpg',
        fileUrl: 'https://example.com/template-email.pdf',
        rating: 4.6,
        downloads: 234,
        customizable: true,
        tags: ['email', 'follow-up', 'pagos', 'clientes'],
        createdAt: new Date('2024-02-15'),
        isPremium: true
      }
    ];

    let filtered = mockTemplates;

    if (category) {
      filtered = filtered.filter(t => t.category === category);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(t => 
        t.name.toLowerCase().includes(searchLower) ||
        t.description.toLowerCase().includes(searchLower) ||
        t.tags.some(tag => tag.toLowerCase().includes(searchLower))
      );
    }

    if (isPremium !== undefined) {
      filtered = filtered.filter(t => t.isPremium === isPremium);
    }

    return filtered.sort((a, b) => {
      if (a.isPremium === b.isPremium) {
        return b.rating - a.rating;
      }
      return a.isPremium ? 1 : -1;
    });
  }

  async purchaseTemplate(templateId: string, userId: string): Promise<TemplatePurchase> {
    // Get template details
    const templates = await this.getTemplates();
    const template = templates.find(t => t.id === templateId);
    
    if (!template) {
      throw new Error('Template not found');
    }

    if (template.isPremium) {
      // TODO: Implement payment processing with Stripe/RevenueCat
      // For now, return mock purchase
      const purchase: TemplatePurchase = {
        id: `purchase_${templateId}_${userId}_${Date.now()}`,
        templateId,
        userId,
        purchaseDate: new Date(),
        amount: template.price,
        status: 'completed'
      };

      // TODO: Save to database
      // TODO: Send notification to creator
      // TODO: Update download count
      
      return purchase;
    } else {
      // Free template
      const purchase: TemplatePurchase = {
        id: `free_${templateId}_${userId}_${Date.now()}`,
        templateId,
        userId,
        purchaseDate: new Date(),
        amount: 0,
        status: 'completed'
      };

      return purchase;
    }
  }

  async getUserTemplates(userId: string): Promise<InvoiceTemplate[]> {
    // TODO: Get templates purchased by user from database
    // For now, return empty array
    return [];
  }

  async getCreatorTemplates(userId: string): Promise<InvoiceTemplate[]> {
    // TODO: Get templates created by user from database
    const templates = await this.getTemplates();
    return templates.filter(t => t.creatorId === userId);
  }

  async getTemplateStats(userId: string): Promise<{
    templatesSold: number;
    totalRevenue: number;
    averageRating: number;
    totalDownloads: number;
  }> {
    // TODO: Get real stats from database
    const creatorTemplates = await this.getCreatorTemplates(userId);
    
    return {
      templatesSold: creatorTemplates.reduce((sum, t) => sum + t.downloads, 0),
      totalRevenue: creatorTemplates.filter(t => t.isPremium).reduce((sum, t) => sum + (t.price * t.downloads), 0),
      averageRating: creatorTemplates.length > 0 
        ? creatorTemplates.reduce((sum, t) => sum + t.rating, 0) / creatorTemplates.length 
        : 0,
      totalDownloads: creatorTemplates.reduce((sum, t) => sum + t.downloads, 0)
    };
  }

  async getPopularTemplates(limit: number = 5): Promise<InvoiceTemplate[]> {
    const templates = await this.getTemplates();
    return templates
      .sort((a, b) => b.downloads - a.downloads)
      .slice(0, limit);
  }

  async getFreeTemplates(): Promise<InvoiceTemplate[]> {
    return this.getTemplates(undefined, undefined, false);
  }

  async getPremiumTemplates(): Promise<InvoiceTemplate[]> {
    return this.getTemplates(undefined, undefined, true);
  }
}
