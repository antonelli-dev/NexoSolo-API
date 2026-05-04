import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface UserRole {
  type: 'freelancer' | 'client' | 'admin';
  permissions: string[];
  features: string[];
  uiComponents: string[];
  apiEndpoints: string[];
}

export interface RoleStrategy {
  getDashboard(userId: string): Promise<any>;
  getPermissions(userId: string): Promise<string[]>;
  getFeatures(userId: string): Promise<string[]>;
  getUiComponents(userId: string): Promise<string[]>;
  getApiEndpoints(userId: string): Promise<string[]>;
  canAccess(userId: string, resource: string): Promise<boolean>;
}

export interface SubscriptionTier {
  id: string;
  name: string;
  price: number;
  features: string[];
  limits: Record<string, number>;
  roleCapabilities: {
    freelancer: string[];
    client: string[];
  };
}

@Injectable()
export class RoleStrategyFactory {
  constructor(private prisma: PrismaService) {}

  async createStrategy(userId: string): Promise<RoleStrategy> {
    const userProfile = await this.getUserProfile(userId);
    const subscription = await this.getUserSubscription(userId);
    
    switch (userProfile.role) {
      case 'freelancer':
        return new FreelancerStrategy(userId, subscription, this.prisma);
      case 'client':
        return new ClientStrategy(userId, subscription, this.prisma);
      case 'admin':
        return new AdminStrategy(userId, subscription, this.prisma);
      default:
        throw new Error(`Unknown role: ${userProfile.role}`);
    }
  }

  private async getUserProfile(userId: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { id: userId },
      select: { 
        id: true,
        subscriptionTier: true,
        displayName: true,
        email: true,
        niche: true
      }
    });
    
    if (!profile) {
      throw new Error('User profile not found');
    }
    
    // Determine role based on niche or other logic
    // For now, default to freelancer, but could be extended
    const role = profile.niche === 'client' ? 'client' : 'freelancer';
    
    return { ...profile, role };
  }

  private async getUserSubscription(userId: string) {
    // TODO: Get from subscription service
    return {
      id: 'pro',
      name: 'Pro',
      price: 19.99,
      features: ['unlimited_clients', 'ai_pricing', 'analytics'],
      limits: {
        clients: 999,
        projects: 999,
        invoices: 999,
        storage: 10000
      },
      roleCapabilities: {
        freelancer: ['advanced_analytics', 'ai_pricing_coach', 'unlimited_clients'],
        client: ['premium_support', 'advanced_document_access'],
        admin: ['system_monitoring', 'user_management']
      }
    };
  }
}

class FreelancerStrategy implements RoleStrategy {
  constructor(
    private userId: string,
    private subscription: SubscriptionTier,
    private prisma: PrismaService
  ) {}

  async getDashboard(userId: string): Promise<any> {
    const revenueAnalytics = await this.getRevenueAnalytics(userId);
    const streakInfo = await this.getStreakInfo(userId);
    const recentActivity = await this.getRecentActivity(userId);

    return {
      type: 'freelancer_dashboard',
      sections: [
        {
          id: 'revenue_overview',
          type: 'metrics',
          data: {
            totalRevenue: revenueAnalytics.totalRevenue,
            monthlyAverage: revenueAnalytics.averageMonthlyRevenue,
            growthRate: revenueAnalytics.growthRate,
            pendingPayments: await this.getPendingPayments(userId)
          }
        },
        {
          id: 'streak_info',
          type: 'gamification',
          data: streakInfo
        },
        {
          id: 'recent_activity',
          type: 'timeline',
          data: recentActivity
        },
        {
          id: 'quick_actions',
          type: 'actions',
          data: [
            { id: 'create_invoice', label: 'Create Invoice', icon: 'document-plus' },
            { id: 'add_client', label: 'Add Client', icon: 'user-plus' },
            { id: 'send_reminder', label: 'Send Reminder', icon: 'bell' },
            { id: 'view_analytics', label: 'View Analytics', icon: 'chart-bar' }
          ]
        }
      ]
    };
  }

  async getPermissions(userId: string): Promise<string[]> {
    const basePermissions = [
      'clients.read', 'clients.write', 'clients.delete',
      'projects.read', 'projects.write', 'projects.delete',
      'invoices.read', 'invoices.write', 'invoices.delete',
      'payments.read', 'payments.write',
      'analytics.read',
      'gamification.read',
      'templates.read', 'templates.write'
    ];

    const subscriptionPermissions = this.getSubscriptionPermissions();
    
    return [...basePermissions, ...subscriptionPermissions];
  }

  async getFeatures(userId: string): Promise<string[]> {
    const baseFeatures = [
      'dashboard', 'clients_management', 'projects_management', 
      'invoicing', 'payment_tracking', 'basic_analytics',
      'revenue_streaks', 'milestones'
    ];

    const subscriptionFeatures = this.subscription.features;
    
    return [...baseFeatures, ...subscriptionFeatures];
  }

  async getUiComponents(userId: string): Promise<string[]> {
    return [
      'RevenueChart', 'StreakBadge', 'ClientList', 'ProjectCard',
      'InvoiceTable', 'PaymentStatus', 'AnalyticsPanel',
      'GamificationWidget', 'QuickActions', 'NotificationCenter'
    ];
  }

  async getApiEndpoints(userId: string): Promise<string[]> {
    return [
      'GET /v1/freelance/summary',
      'GET /v1/freelance/clients',
      'POST /v1/freelance/clients',
      'GET /v1/freelance/projects',
      'POST /v1/freelance/projects',
      'GET /v1/freelance/invoices',
      'POST /v1/freelance/invoices',
      'GET /v1/analytics/revenue',
      'GET /v1/gamification/streak',
      'GET /v1/smart-invoicing/payment-methods'
    ];
  }

  async canAccess(userId: string, resource: string): Promise<boolean> {
    const permissions = await this.getPermissions(userId);
    return permissions.includes(resource);
  }

  private async getRevenueAnalytics(userId: string) {
    // TODO: Implement actual analytics
    return {
      totalRevenue: 15000,
      averageMonthlyRevenue: 3000,
      growthRate: 15
    };
  }

  private async getStreakInfo(userId: string) {
    // TODO: Implement actual streak logic
    return {
      current: 4,
      longest: 8,
      weeklyGoal: 2500,
      thisWeekRevenue: 2800,
      streakBonus: 0.4
    };
  }

  private async getRecentActivity(userId: string) {
    // TODO: Implement actual activity tracking
    return [
      { type: 'invoice_sent', client: 'ACME Corp', amount: 1500, time: '2 hours ago' },
      { type: 'payment_received', client: 'StartupXYZ', amount: 800, time: '1 day ago' },
      { type: 'project_completed', client: 'TechCorp', project: 'Website Redesign', time: '2 days ago' }
    ];
  }

  private async getPendingPayments(userId: string) {
    // TODO: Calculate actual pending payments
    return 3200;
  }

  private getSubscriptionPermissions(): string[] {
    const permissionMap: Record<string, string[]> = {
      'free': ['basic_analytics', 'limited_clients'],
      'pro': ['ai_pricing_coach', 'advanced_analytics', 'unlimited_clients'],
      'business': ['client_portal', 'team_management', 'api_access', 'white_label']
    };
    
    return permissionMap[this.subscription.id] || [];
  }
}

class ClientStrategy implements RoleStrategy {
  constructor(
    private userId: string,
    private subscription: SubscriptionTier,
    private prisma: PrismaService
  ) {}

  async getDashboard(userId: string): Promise<any> {
    const clientInfo = await this.getClientInfo(userId);
    const activeProjects = await this.getActiveProjects(userId);
    const pendingInvoices = await this.getPendingInvoices(userId);
    const recentMessages = await this.getRecentMessages(userId);

    return {
      type: 'client_dashboard',
      sections: [
        {
          id: 'projects_overview',
          type: 'projects',
          data: {
            activeProjects: activeProjects.length,
            completedProjects: clientInfo.completedProjects,
            totalSpent: clientInfo.totalSpent
          }
        },
        {
          id: 'pending_invoices',
          type: 'invoices',
          data: pendingInvoices
        },
        {
          id: 'recent_messages',
          type: 'communication',
          data: recentMessages
        },
        {
          id: 'quick_actions',
          type: 'actions',
          data: [
            { id: 'view_projects', label: 'View Projects', icon: 'folder' },
            { id: 'pay_invoices', label: 'Pay Invoices', icon: 'credit-card' },
            { id: 'download_docs', label: 'Download Documents', icon: 'document' },
            { id: 'contact_freelancer', label: 'Contact Freelancer', icon: 'message' }
          ]
        }
      ]
    };
  }

  async getPermissions(userId: string): Promise<string[]> {
    return [
      'projects.read', 'projects.view_status',
      'invoices.read', 'invoices.pay', 'invoices.download',
      'documents.read', 'documents.download',
      'messages.read', 'messages.write',
      'profile.read', 'profile.write'
    ];
  }

  async getFeatures(userId: string): Promise<string[]> {
    return [
      'project_viewing', 'invoice_payment', 'document_access',
      'messaging', 'profile_management', 'notifications'
    ];
  }

  async getUiComponents(userId: string): Promise<string[]> {
    return [
      'ProjectCard', 'InvoiceCard', 'PaymentButton', 'DocumentViewer',
      'MessageThread', 'ProfileSettings', 'NotificationCenter'
    ];
  }

  async getApiEndpoints(userId: string): Promise<string[]> {
    return [
      'GET /v1/client/projects',
      'GET /v1/client/invoices',
      'POST /v1/client/invoices/:id/pay',
      'GET /v1/client/documents',
      'GET /v1/client/messages',
      'POST /v1/client/messages'
    ];
  }

  async canAccess(userId: string, resource: string): Promise<boolean> {
    const permissions = await this.getPermissions(userId);
    return permissions.includes(resource);
  }

  private async getClientInfo(userId: string) {
    // TODO: Get actual client info
    return {
      completedProjects: 12,
      totalSpent: 15000
    };
  }

  private async getActiveProjects(userId: string) {
    // TODO: Get actual active projects
    return [
      { id: '1', name: 'Website Development', status: 'in_progress', progress: 75 },
      { id: '2', name: 'Mobile App Design', status: 'in_progress', progress: 40 }
    ];
  }

  private async getPendingInvoices(userId: string) {
    // TODO: Get actual pending invoices
    return [
      { id: 'inv_1', number: '001', amount: 1500, dueDate: '2024-01-15', status: 'pending' },
      { id: 'inv_2', number: '002', amount: 800, dueDate: '2024-01-20', status: 'pending' }
    ];
  }

  private async getRecentMessages(userId: string) {
    // TODO: Get actual messages
    return [
      { id: '1', from: 'freelancer', message: 'Project update: Design mockups are ready', time: '1 hour ago' },
      { id: '2', from: 'freelancer', message: 'Thank you for the payment!', time: '2 days ago' }
    ];
  }
}

class AdminStrategy implements RoleStrategy {
  constructor(
    private userId: string,
    private subscription: SubscriptionTier,
    private prisma: PrismaService
  ) {}

  async getDashboard(userId: string): Promise<any> {
    return {
      type: 'admin_dashboard',
      sections: [
        {
          id: 'system_overview',
          type: 'metrics',
          data: {
            totalUsers: 10000,
            activeSubscriptions: 2500,
            monthlyRevenue: 50000,
            systemHealth: 'healthy'
          }
        },
        {
          id: 'admin_actions',
          type: 'actions',
          data: [
            { id: 'user_management', label: 'User Management', icon: 'users' },
            { id: 'subscription_analytics', label: 'Subscription Analytics', icon: 'chart-line' },
            { id: 'system_monitoring', label: 'System Monitoring', icon: 'server' },
            { id: 'content_moderation', label: 'Content Moderation', icon: 'shield' }
          ]
        }
      ]
    };
  }

  async getPermissions(userId: string): Promise<string[]> {
    return [
      'users.read', 'users.write', 'users.delete',
      'subscriptions.read', 'subscriptions.write',
      'analytics.read', 'analytics.admin',
      'system.monitor', 'system.configure',
      'content.moderate'
    ];
  }

  async getFeatures(userId: string): Promise<string[]> {
    return [
      'user_management', 'subscription_management', 'system_analytics',
      'monitoring', 'configuration', 'moderation'
    ];
  }

  async getUiComponents(userId: string): Promise<string[]> {
    return [
      'UserTable', 'SubscriptionChart', 'SystemMetrics', 'AdminPanel',
      'ModerationQueue', 'ConfigurationForm'
    ];
  }

  async getApiEndpoints(userId: string): Promise<string[]> {
    return [
      'GET /v1/admin/users',
      'POST /v1/admin/users',
      'DELETE /v1/admin/users/:id',
      'GET /v1/admin/subscriptions',
      'GET /v1/admin/analytics',
      'GET /v1/admin/system/health'
    ];
  }

  async canAccess(userId: string, resource: string): Promise<boolean> {
    const permissions = await this.getPermissions(userId);
    return permissions.includes(resource);
  }
}

@Injectable()
export class RoleService {
  constructor(private roleStrategyFactory: RoleStrategyFactory) {}

  async getUserRoleStrategy(userId: string): Promise<RoleStrategy> {
    return this.roleStrategyFactory.createStrategy(userId);
  }

  async getUserDashboard(userId: string): Promise<any> {
    const strategy = await this.getUserRoleStrategy(userId);
    return strategy.getDashboard(userId);
  }

  async getUserPermissions(userId: string): Promise<string[]> {
    const strategy = await this.getUserRoleStrategy(userId);
    return strategy.getPermissions(userId);
  }

  async getUserFeatures(userId: string): Promise<string[]> {
    const strategy = await this.getUserRoleStrategy(userId);
    return strategy.getFeatures(userId);
  }

  async canUserAccess(userId: string, resource: string): Promise<boolean> {
    const strategy = await this.getUserRoleStrategy(userId);
    return strategy.canAccess(userId, resource);
  }
}
