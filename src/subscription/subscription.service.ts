import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from '../common/logger.service';

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  currency: string;
  interval: 'month' | 'year';
  features: string[];
  limits: {
    clients: number;
    projects: number;
    invoices: number;
    aiRequests: number;
    templates: number;
    automationRules: number;
  };
  popular?: boolean;
}

export interface UserSubscription {
  id: string;
  userId: string;
  planId: string;
  status: 'active' | 'cancelled' | 'expired' | 'trial';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  trialEnd?: Date;
}

export interface UsageStats {
  clients: number;
  projects: number;
  invoices: number;
  aiRequests: number;
  templates: number;
  automationRules: number;
}

@Injectable()
export class SubscriptionService {
  private readonly logger: AppLogger;

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {
    this.logger = new AppLogger(config);
  }

  async getPlans(): Promise<SubscriptionPlan[]> {
    return [
      {
        id: 'free',
        name: 'Free',
        price: 0,
        currency: 'USD',
        interval: 'month',
        features: [
          'Up to 3 clients',
          'Up to 5 projects',
          'Up to 10 invoices',
          'Basic dashboard',
          'Email support',
        ],
        limits: {
          clients: 3,
          projects: 5,
          invoices: 10,
          aiRequests: 5,
          templates: 2,
          automationRules: 0,
        },
      },
      {
        id: 'pro',
        name: 'Pro',
        price: 19.99,
        currency: 'USD',
        interval: 'month',
        features: [
          'Unlimited clients',
          'Unlimited projects',
          'Unlimited invoices',
          'AI Pricing Coach',
          'Payment reminders',
          'Document scanner',
          'Template store access',
          'Revenue streaks',
          'Priority support',
        ],
        limits: {
          clients: -1,
          projects: -1,
          invoices: -1,
          aiRequests: 100,
          templates: 20,
          automationRules: 10,
        },
        popular: true,
      },
      {
        id: 'business',
        name: 'Business',
        price: 49.99,
        currency: 'USD',
        interval: 'month',
        features: [
          'Everything in Pro',
          'Unlimited AI requests',
          'Advanced automation',
          'Custom templates',
          'Team collaboration',
          'API access',
          'Dedicated support',
          'Custom branding',
        ],
        limits: {
          clients: -1,
          projects: -1,
          invoices: -1,
          aiRequests: -1,
          templates: -1,
          automationRules: -1,
        },
      },
      {
        id: 'pro-yearly',
        name: 'Pro (Yearly)',
        price: 199.99,
        currency: 'USD',
        interval: 'year',
        features: [
          'Everything in Pro',
          '2 months free',
          'Priority feature access',
        ],
        limits: {
          clients: -1,
          projects: -1,
          invoices: -1,
          aiRequests: 100,
          templates: 20,
          automationRules: 10,
        },
      },
    ];
  }

  async getUserSubscription(userId: string): Promise<UserSubscription | null> {
    // TODO: Get from database
    // Mock data for demo
    return {
      id: 'sub_123',
      userId,
      planId: 'pro',
      status: 'active',
      currentPeriodStart: new Date('2024-02-01'),
      currentPeriodEnd: new Date('2024-03-01'),
      cancelAtPeriodEnd: false,
    };
  }

  async getUserUsage(userId: string): Promise<UsageStats> {
    // TODO: Calculate from database
    const [clientCount, projectCount, invoiceCount] = await Promise.all([
      this.prisma.freelanceClient.count({ where: { userId } }),
      this.prisma.freelanceProject.count({ where: { userId } }),
      this.prisma.freelanceInvoice.count({ where: { project: { userId } } }),
    ]);

    // Mock AI requests and other usage
    return {
      clients: clientCount,
      projects: projectCount,
      invoices: invoiceCount,
      aiRequests: 12,
      templates: 3,
      automationRules: 2,
    };
  }

  async checkFeatureAccess(userId: string, feature: string): Promise<{
    hasAccess: boolean;
    currentUsage: number;
    limit: number;
    canUpgrade: boolean;
  }> {
    const subscription = await this.getUserSubscription(userId);
    const usage = await this.getUserUsage(userId);
    const plans = await this.getPlans();
    
    const plan = plans.find(p => p.id === subscription?.planId) || plans[0]; // Default to free
    
    const featureLimits: Record<string, keyof UsageStats> = {
      'clients': 'clients',
      'projects': 'projects',
      'invoices': 'invoices',
      'ai': 'aiRequests',
      'templates': 'templates',
      'automation': 'automationRules',
    };

    const usageKey = featureLimits[feature];
    if (!usageKey) {
      return { hasAccess: true, currentUsage: 0, limit: -1, canUpgrade: false };
    }

    const currentUsage = usage[usageKey];
    const limit = plan.limits[usageKey];
    const hasAccess = limit === -1 || currentUsage < limit;
    const canUpgrade = !hasAccess && plan.id !== 'business';

    return {
      hasAccess,
      currentUsage,
      limit,
      canUpgrade,
    };
  }

  async requireSubscription(userId: string, requiredPlan: 'free' | 'pro' | 'business'): Promise<{
    hasAccess: boolean;
    currentPlan: string;
    requiredPlan: string;
    upgradeUrl?: string;
  }> {
    const subscription = await this.getUserSubscription(userId);
    const currentPlan = subscription?.planId || 'free';
    
    const planHierarchy = { free: 0, pro: 1, business: 2 };
    const currentLevel = planHierarchy[currentPlan as keyof typeof planHierarchy] || 0;
    const requiredLevel = planHierarchy[requiredPlan];
    
    const hasAccess = currentLevel >= requiredLevel;
    
    return {
      hasAccess,
      currentPlan,
      requiredPlan,
      upgradeUrl: hasAccess ? undefined : '/upgrade',
    };
  }

  async createSubscription(userId: string, planId: string): Promise<UserSubscription> {
    // TODO: Integrate with Stripe/RevenueCat
    const plans = await this.getPlans();
    const plan = plans.find(p => p.id === planId);
    
    if (!plan) {
      throw new Error('Plan not found');
    }

    const now = new Date();
    const periodEnd = new Date(now);
    
    if (plan.interval === 'month') {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    } else {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    }

    // TODO: Save to database
    const subscription: UserSubscription = {
      id: `sub_${Date.now()}`,
      userId,
      planId,
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
    };

    return subscription;
  }

  async updateSubscription(userId: string, planId: string): Promise<UserSubscription> {
    // TODO: Update existing subscription
    return this.createSubscription(userId, planId);
  }

  async cancelSubscription(userId: string, cancelAtPeriodEnd: boolean = true): Promise<UserSubscription> {
    const subscription = await this.getUserSubscription(userId);
    
    if (!subscription) {
      throw new Error('No active subscription found');
    }

    // TODO: Update in Stripe/RevenueCat
    // TODO: Update in database
    
    return {
      ...subscription,
      cancelAtPeriodEnd,
    };
  }

  async reactivateSubscription(userId: string): Promise<UserSubscription> {
    const subscription = await this.getUserSubscription(userId);
    
    if (!subscription) {
      throw new Error('No subscription found');
    }

    // TODO: Reactivate in Stripe/RevenueCat
    // TODO: Update in database
    
    return {
      ...subscription,
      status: 'active',
      cancelAtPeriodEnd: false,
    };
  }

  async getSubscriptionHistory(userId: string): Promise<Array<{
    id: string;
    planName: string;
    status: string;
    startDate: Date;
    endDate?: Date;
    amount: number;
    currency: string;
  }>> {
    // TODO: Get from database
    return [
      {
        id: 'sub_hist_1',
        planName: 'Pro',
        status: 'active',
        startDate: new Date('2024-02-01'),
        amount: 19.99,
        currency: 'USD',
      },
    ];
  }

  async getBillingInfo(userId: string): Promise<{
    nextBillingDate?: Date;
    nextAmount?: number;
    currency?: string;
    paymentMethod?: string;
    lastPaymentDate?: Date;
    lastAmount?: number;
  }> {
    const subscription = await this.getUserSubscription(userId);
    const plans = await this.getPlans();
    const plan = plans.find(p => p.id === subscription?.planId);

    if (!subscription || !plan) {
      return {};
    }

    return {
      nextBillingDate: subscription.cancelAtPeriodEnd ? undefined : subscription.currentPeriodEnd,
      nextAmount: subscription.cancelAtPeriodEnd ? undefined : plan.price,
      currency: plan.currency,
      paymentMethod: 'card ending in 4242', // TODO: Get from Stripe
      lastPaymentDate: subscription.currentPeriodStart,
      lastAmount: plan.price,
    };
  }

  async updatePaymentMethod(userId: string, paymentMethodId: string): Promise<void> {
    // TODO: Update payment method in Stripe
    // TODO: Update in database
    this.logger.logBusinessEvent('payment_method_update_requested', userId, {
      paymentMethodId,
    });
  }
}
