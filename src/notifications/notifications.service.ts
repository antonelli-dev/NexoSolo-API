import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from '../common/logger.service';

export interface NotificationTemplate {
  id: string;
  name: string;
  type: 'email' | 'push' | 'both';
  subject?: string;
  template: string;
  variables: string[];
}

export interface NotificationEvent {
  type: 'invoice_sent' | 'invoice_viewed' | 'invoice_paid' | 'invoice_overdue' | 
        'payment_received' | 'new_client' | 'project_completed' | 'streak_milestone' |
        'revenue_goal' | 'payment_reminder' | 'weekly_digest';
  userId: string;
  data: Record<string, any>;
  channels?: ('email' | 'push')[];
}

export interface NotificationPreferences {
  email: {
    invoiceEvents: boolean;
    paymentEvents: boolean;
    streakEvents: boolean;
    weeklyDigest: boolean;
    marketingEmails: boolean;
  };
  push: {
    invoiceEvents: boolean;
    paymentEvents: boolean;
    streakEvents: boolean;
    reminders: boolean;
  };
}

@Injectable()
export class NotificationsService {
  private readonly logger: AppLogger;

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {
    this.logger = new AppLogger(config);
  }

  private templates: Record<string, NotificationTemplate> = {
    invoice_sent: {
      id: 'invoice_sent',
      name: 'Invoice Sent',
      type: 'email',
      subject: 'Invoice {{invoiceNumber}} sent to {{clientName}}',
      template: `Hi {{freelancerName}},

Your invoice {{invoiceNumber}} for {{amount}} {{currency}} has been sent to {{clientName}}.

Project: {{projectName}}
Due date: {{dueDate}}

You can track the status in your RizzUp dashboard.

Best regards,
RizzUp Team`,
      variables: ['freelancerName', 'invoiceNumber', 'clientName', 'amount', 'currency', 'projectName', 'dueDate']
    },
    invoice_viewed: {
      id: 'invoice_viewed',
      name: 'Invoice Viewed',
      type: 'push',
      template: '{{clientName}} viewed your invoice {{invoiceNumber}}',
      variables: ['clientName', 'invoiceNumber']
    },
    invoice_paid: {
      id: 'invoice_paid',
      name: 'Invoice Paid',
      type: 'both',
      subject: 'Payment received for invoice {{invoiceNumber}}',
      template: `Great news! {{clientName}} has paid your invoice {{invoiceNumber}}.

Amount: {{amount}} {{currency}}
Payment date: {{paymentDate}}

This payment brings your total revenue to {{totalRevenue}} {{currency}}.

Keep up the great work!

RizzUp Team`,
      variables: ['clientName', 'invoiceNumber', 'amount', 'currency', 'paymentDate', 'totalRevenue']
    },
    invoice_overdue: {
      id: 'invoice_overdue',
      name: 'Invoice Overdue',
      type: 'both',
      subject: 'Invoice {{invoiceNumber}} is overdue',
      template: `Hi {{freelancerName}},

Your invoice {{invoiceNumber}} for {{amount}} {{currency}} is now overdue.

Client: {{clientName}}
Due date: {{dueDate}}
Days overdue: {{daysOverdue}}

Would you like us to help you write a payment reminder email?

RizzUp Team`,
      variables: ['freelancerName', 'invoiceNumber', 'amount', 'currency', 'clientName', 'dueDate', 'daysOverdue']
    },
    payment_received: {
      id: 'payment_received',
      name: 'Payment Received',
      type: 'push',
      template: 'Payment of {{amount}} {{currency}} received from {{clientName}}',
      variables: ['amount', 'currency', 'clientName']
    },
    new_client: {
      id: 'new_client',
      name: 'New Client',
      type: 'both',
      subject: 'Welcome new client: {{clientName}}!',
      template: `Congratulations! You've added a new client to RizzUp.

Client: {{clientName}}
Email: {{clientEmail}}

This brings your total client count to {{totalClients}}.

Here are some tips to get started:
- Create your first project
- Set up your pricing
- Enable payment reminders

Good luck with your new client!

RizzUp Team`,
      variables: ['clientName', 'clientEmail', 'totalClients']
    },
    project_completed: {
      id: 'project_completed',
      name: 'Project Completed',
      type: 'push',
      template: 'Project "{{projectName}}" marked as completed',
      variables: ['projectName']
    },
    streak_milestone: {
      id: 'streak_milestone',
      name: 'Streak Milestone',
      type: 'both',
      subject: 'Amazing! {{streakWeeks}} week revenue streak! {{emoji}}',
      template: `Incredible achievement! You've maintained a {{streakWeeks}}-week revenue streak!

Weekly revenue: {{weeklyRevenue}} {{currency}}
Total streak revenue: {{streakRevenue}} {{currency}}

You're in the top {{percentile}}% of freelancers on RizzUp!

Keep this momentum going. Your next milestone is {{nextMilestone}}.

{{emoji}} RizzUp Team`,
      variables: ['streakWeeks', 'weeklyRevenue', 'currency', 'streakRevenue', 'percentile', 'nextMilestone', 'emoji']
    },
    revenue_goal: {
      id: 'revenue_goal',
      name: 'Revenue Goal',
      type: 'push',
      template: 'You\'re {{goalProgress}}% to your {{goalAmount}} {{currency}} monthly goal!',
      variables: ['goalProgress', 'goalAmount', 'currency']
    },
    payment_reminder: {
      id: 'payment_reminder',
      name: 'Payment Reminder',
      type: 'push',
      template: 'Reminder: Follow up with {{clientName}} about invoice {{invoiceNumber}}',
      variables: ['clientName', 'invoiceNumber']
    },
    weekly_digest: {
      id: 'weekly_digest',
      name: 'Weekly Digest',
      type: 'email',
      subject: 'Your weekly revenue summary - {{weekRevenue}} {{currency}}',
      template: `Hi {{freelancerName}},

Here's your weekly revenue summary:

This week: {{weekRevenue}} {{currency}}
Total revenue: {{totalRevenue}} {{currency}}
Active clients: {{activeClients}}
Pending payments: {{pendingPayments}} {{currency}}

Top client this week: {{topClient}} ({{topClientRevenue}} {{currency}})

{{insight}}

Keep up the great work!

RizzUp Team`,
      variables: ['freelancerName', 'weekRevenue', 'currency', 'totalRevenue', 'activeClients', 'pendingPayments', 'topClient', 'topClientRevenue', 'insight']
    }
  };

  async sendNotification(event: NotificationEvent): Promise<void> {
    const template = this.templates[event.type];
    if (!template) {
      throw new Error(`Template not found for event type: ${event.type}`);
    }

    const preferences = await this.getUserPreferences(event.userId);
    const channels = event.channels || ['email'];

    // Check user preferences for each channel
    for (const channel of channels) {
      if (!this.shouldSendNotification(preferences, channel, event.type)) {
        continue;
      }

      if (channel === 'email' && (template.type === 'email' || template.type === 'both')) {
        await this.sendEmailNotification(event.userId, template, event.data);
      }

      if (channel === 'push' && (template.type === 'push' || template.type === 'both')) {
        await this.sendPushNotification(event.userId, template, event.data);
      }
    }
  }

  async getUserPreferences(userId: string): Promise<NotificationPreferences> {
    // TODO: Get from database
    return {
      email: {
        invoiceEvents: true,
        paymentEvents: true,
        streakEvents: true,
        weeklyDigest: true,
        marketingEmails: false,
      },
      push: {
        invoiceEvents: true,
        paymentEvents: true,
        streakEvents: true,
        reminders: true,
      },
    };
  }

  async updatePreferences(userId: string, preferences: Partial<NotificationPreferences>): Promise<NotificationPreferences> {
    // TODO: Update in database
    const current = await this.getUserPreferences(userId);
    return {
      email: { ...current.email, ...preferences.email },
      push: { ...current.push, ...preferences.push },
    };
  }

  private shouldSendNotification(preferences: NotificationPreferences, channel: 'email' | 'push', eventType: string): boolean {
    if (channel === 'email') {
      if (['invoice_sent', 'invoice_viewed', 'invoice_paid', 'invoice_overdue'].includes(eventType)) {
        return preferences.email.invoiceEvents;
      }
      if (['payment_received', 'payment_reminder'].includes(eventType)) {
        return preferences.email.paymentEvents;
      }
      if (['streak_milestone', 'revenue_goal'].includes(eventType)) {
        return preferences.email.streakEvents;
      }
      if (eventType === 'weekly_digest') {
        return preferences.email.weeklyDigest;
      }
    }

    if (channel === 'push') {
      if (['invoice_sent', 'invoice_viewed', 'invoice_paid', 'invoice_overdue'].includes(eventType)) {
        return preferences.push.invoiceEvents;
      }
      if (['payment_received', 'payment_reminder'].includes(eventType)) {
        return preferences.push.paymentEvents;
      }
      if (['streak_milestone', 'revenue_goal'].includes(eventType)) {
        return preferences.push.streakEvents;
      }
      if (eventType === 'payment_reminder') {
        return preferences.push.reminders;
      }
    }

    return true;
  }

  private async sendEmailNotification(userId: string, template: NotificationTemplate, data: Record<string, any>): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL || 'noreply@rizzup.app';

    if (!apiKey) {
      this.logger.warn('Email notification skipped - RESEND_API_KEY not configured');
      return;
    }

    // Get user email
    const user = await this.prisma.profile.findUnique({
      where: { id: userId },
      select: { email: true, displayName: true }
    });

    if (!user?.email) {
      this.logger.warn('Email notification skipped - user email not found', { userId });
      return;
    }

    // Render template
    const subject = this.renderTemplate(template.subject || '', { ...data, freelancerName: user.displayName || 'Freelancer' });
    const html = this.renderTemplate(template.template, { ...data, freelancerName: user.displayName || 'Freelancer' });

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: user.email,
          subject,
          html,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.logError(new Error('Failed to send email'), { error });
      }
    } catch (error) {
      this.logger.logError(error as Error, { context: 'email_sending' });
    }
  }

  private async sendPushNotification(userId: string, template: NotificationTemplate, data: Record<string, any>): Promise<void> {
    // TODO: Implement push notifications (Firebase, OneSignal, etc.)
    this.logger.logBusinessEvent('push_notification_sent', userId, {
      template: template.name,
      content: this.renderTemplate(template.template, data),
    });
  }

  private renderTemplate(template: string, data: Record<string, any>): string {
    let result = template;
    for (const [key, value] of Object.entries(data)) {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
    }
    return result;
  }

  async getNotificationHistory(userId: string, limit: number = 50): Promise<Array<{
    id: string;
    type: string;
    channel: string;
    content: string;
    sentAt: Date;
    read: boolean;
  }>> {
    // TODO: Get from database
    return [
      {
        id: '1',
        type: 'invoice_paid',
        channel: 'email',
        content: 'Payment received for invoice #001',
        sentAt: new Date(),
        read: true,
      },
      {
        id: '2',
        type: 'streak_milestone',
        channel: 'push',
        content: 'Amazing! 4 week revenue streak! ',
        sentAt: new Date(),
        read: false,
      },
    ];
  }

  async markAsRead(userId: string, notificationId: string): Promise<void> {
    // TODO: Update in database
    this.logger.logBusinessEvent('notification_marked_read', userId, {
      notificationId,
    });
  }

  async markAllAsRead(userId: string): Promise<void> {
    // TODO: Update in database
    this.logger.logBusinessEvent('all_notifications_marked_read', userId);
  }
}
