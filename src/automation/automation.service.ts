import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface PaymentReminder {
  id: string;
  userId: string;
  invoiceId: string;
  clientId: string;
  clientEmail: string;
  clientName: string;
  invoiceNumber: string;
  amount: number;
  dueDate: Date;
  daysOverdue: number;
  reminderType: 'due_soon' | 'overdue_3' | 'overdue_7' | 'overdue_14';
  status: 'pending' | 'sent' | 'failed';
  scheduledAt: Date;
  sentAt?: Date;
  errorMessage?: string;
}

export interface ReminderRule {
  id: string;
  userId: string;
  name: string;
  enabled: boolean;
  daysBeforeDue: number;
  daysOverdue: number[];
  template: string;
  customMessage?: string;
  sendCopyToFreelancer: boolean;
}

export interface ReminderStats {
  totalReminders: number;
  sentToday: number;
  pendingReminders: number;
  successRate: number;
  averageResponseTime: number;
  paymentsAfterReminder: number;
}

@Injectable()
export class AutomationService {
  constructor(private prisma: PrismaService) {}

  async createReminderRule(userId: string, rule: Omit<ReminderRule, 'id' | 'userId'>): Promise<ReminderRule> {
    // TODO: Save to database
    const newRule: ReminderRule = {
      ...rule,
      id: `rule_${Date.now()}`,
      userId,
    };

    return newRule;
  }

  async getReminderRules(userId: string): Promise<ReminderRule[]> {
    // TODO: Get from database
    const defaultRules: ReminderRule[] = [
      {
        id: 'default-1',
        userId,
        name: 'Recordatorio 3 días antes',
        enabled: true,
        daysBeforeDue: 3,
        daysOverdue: [],
        template: 'due_soon',
        sendCopyToFreelancer: true,
      },
      {
        id: 'default-2',
        userId,
        name: 'Vencido - 3 días',
        enabled: true,
        daysBeforeDue: 0,
        daysOverdue: [3],
        template: 'overdue_3',
        sendCopyToFreelancer: true,
      },
      {
        id: 'default-3',
        userId,
        name: 'Vencido - 7 días',
        enabled: true,
        daysBeforeDue: 0,
        daysOverdue: [7],
        template: 'overdue_7',
        sendCopyToFreelancer: true,
      },
      {
        id: 'default-4',
        userId,
        name: 'Vencido - 14 días',
        enabled: true,
        daysBeforeDue: 0,
        daysOverdue: [14],
        template: 'overdue_14',
        sendCopyToFreelancer: true,
      },
    ];

    return defaultRules;
  }

  async updateReminderRule(ruleId: string, userId: string, updates: Partial<ReminderRule>): Promise<ReminderRule> {
    // TODO: Update in database
    const rules = await this.getReminderRules(userId);
    const rule = rules.find(r => r.id === ruleId);
    
    if (!rule) {
      throw new Error('Reminder rule not found');
    }

    return { ...rule, ...updates };
  }

  async toggleReminderRule(ruleId: string, userId: string): Promise<ReminderRule> {
    const rule = await this.getReminderRule(ruleId, userId);
    return this.updateReminderRule(ruleId, userId, { enabled: !rule.enabled });
  }

  async deleteReminderRule(ruleId: string, userId: string): Promise<void> {
    // TODO: Delete from database
  }

  async generateReminders(userId: string): Promise<PaymentReminder[]> {
    // Get user's overdue invoices
    const invoices = await this.prisma.freelanceInvoice.findMany({
      where: { 
        project: { userId },
        status: { in: ['sent', 'viewed'] }
      },
      include: { 
        project: { include: { client: true } },
        payments: true
      }
    });

    const rules = await this.getReminderRules(userId);
    const reminders: PaymentReminder[] = [];

    for (const invoice of invoices) {
      const daysOverdue = this.calculateDaysOverdue(invoice.dueDate || new Date());
      const daysBeforeDue = this.calculateDaysBeforeDue(invoice.dueDate || new Date());
      
      for (const rule of rules.filter(r => r.enabled)) {
        // Check if this rule should trigger for this invoice
        if (rule.daysBeforeDue > 0 && daysBeforeDue === rule.daysBeforeDue) {
          // Due soon reminder
          const reminder: PaymentReminder = {
            id: `reminder_${invoice.id}_${rule.id}_${Date.now()}`,
            userId,
            invoiceId: invoice.id,
            clientId: invoice.project.client.id,
            clientEmail: invoice.project.client.email || '',
            clientName: invoice.project.client.name,
            invoiceNumber: invoice.invoiceNumber || invoice.id.slice(0, 8),
            amount: Number(invoice.amount),
            dueDate: invoice.dueDate || new Date(),
            daysOverdue: 0,
            reminderType: 'due_soon',
            status: 'pending',
            scheduledAt: new Date(),
          };
          reminders.push(reminder);
        } else if (rule.daysOverdue.includes(daysOverdue) && daysOverdue > 0) {
          // Overdue reminder
          const reminderType = this.getReminderType(daysOverdue);
          const reminder: PaymentReminder = {
            id: `reminder_${invoice.id}_${rule.id}_${Date.now()}`,
            userId,
            invoiceId: invoice.id,
            clientId: invoice.project.client.id,
            clientEmail: invoice.project.client.email || '',
            clientName: invoice.project.client.name,
            invoiceNumber: invoice.invoiceNumber || invoice.id.slice(0, 8),
            amount: Number(invoice.amount),
            dueDate: invoice.dueDate || new Date(),
            daysOverdue,
            reminderType,
            status: 'pending',
            scheduledAt: new Date(),
          };
          reminders.push(reminder);
        }
      }
    }

    return reminders;
  }

  async sendReminder(reminderId: string): Promise<PaymentReminder> {
    // TODO: Get reminder from database
    const reminder: PaymentReminder = {
      id: reminderId,
      userId: 'user1',
      invoiceId: 'inv1',
      clientId: 'client1',
      clientEmail: 'client@example.com',
      clientName: 'John Client',
      invoiceNumber: 'INV-001',
      amount: 1000,
      dueDate: new Date(),
      daysOverdue: 3,
      reminderType: 'overdue_3',
      status: 'pending',
      scheduledAt: new Date(),
    };

    try {
      // Send email using Resend (same as in freelance.service.ts)
      await this.sendPaymentReminderEmail(reminder);
      
      // Update reminder status
      reminder.status = 'sent';
      reminder.sentAt = new Date();

      // TODO: Save to database
      return reminder;

    } catch (error) {
      reminder.status = 'failed';
      reminder.errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // TODO: Save to database
      return reminder;
    }
  }

  async getPendingReminders(userId: string): Promise<PaymentReminder[]> {
    // TODO: Get from database
    return [];
  }

  async getReminderStats(userId: string): Promise<ReminderStats> {
    // TODO: Calculate from database
    return {
      totalReminders: 45,
      sentToday: 3,
      pendingReminders: 7,
      successRate: 94.4,
      averageResponseTime: 2.3, // days
      paymentsAfterReminder: 28,
    };
  }

  async getReminderTemplates(): Promise<Array<{
    id: string;
    name: string;
    type: 'due_soon' | 'overdue_3' | 'overdue_7' | 'overdue_14';
    subject: string;
    body: string;
  }>> {
    return [
      {
        id: 'due_soon',
        name: 'Recordatorio de vencimiento',
        type: 'due_soon',
        subject: 'Recordatorio: Factura {{invoiceNumber}} vence en {{daysBeforeDue}} días',
        body: `Estimado {{clientName}},

Te recordamos que la factura {{invoiceNumber}} por {{amount}} {{currency}} vence en {{daysBeforeDue}} días.

Datos de la factura:
- Número: {{invoiceNumber}}
- Monto: {{amount}} {{currency}}
- Fecha de vencimiento: {{dueDate}}

Puedes realizar el pago mediante transferencia bancaria a la cuenta que te hemos proporcionado anteriormente.

Gracias por tu preferencia.

Atentamente,
{{freelancerName}}`
      },
      {
        id: 'overdue_3',
        name: 'Vencido - 3 días',
        type: 'overdue_3',
        subject: 'Urgente: Factura {{invoiceNumber}} vencida hace 3 días',
        body: `Estimado {{clientName}},

Te escribimos para informarte que la factura {{invoiceNumber}} por {{amount}} {{currency}} está vencida hace 3 días.

Datos de la factura:
- Número: {{invoiceNumber}}
- Monto: {{amount}} {{currency}}
- Fecha de vencimiento: {{dueDate}}
- Días de retraso: {{daysOverdue}}

Te pedimos amablemente que realices el pago a la brevedad posible para evitar recargos por mora.

Si ya realizaste el pago, por favor ignora este email.

Atentamente,
{{freelancerName}}`
      },
      {
        id: 'overdue_7',
        name: 'Vencido - 7 días',
        type: 'overdue_7',
        subject: 'Muy Urgente: Factura {{invoiceNumber}} vencida hace 7 días',
        body: `Estimado {{clientName}},

Te contactamos nuevamente respecto a la factura {{invoiceNumber}} por {{amount}} {{currency}}, que está vencida hace 7 días.

Datos de la factura:
- Número: {{invoiceNumber}}
- Monto: {{amount}} {{currency}}
- Fecha de vencimiento: {{dueDate}}
- Días de retraso: {{daysOverdue}}

Este es un recordatorio urgente para que realices el pago lo antes posible. Si tienes alguna pregunta o dificultad con el pago, por favor contáctanos de inmediato.

Atentamente,
{{freelancerName}}`
      },
      {
        id: 'overdue_14',
        name: 'Vencido - 14 días',
        type: 'overdue_14',
        subject: 'Último Aviso: Factura {{invoiceNumber}} vencida hace 14 días',
        body: `Estimado {{clientName}},

Este es el último aviso respecto a la factura {{invoiceNumber}} por {{amount}} {{currency}}, que está vencida hace 14 días.

Datos de la factura:
- Número: {{invoiceNumber}}
- Monto: {{amount}} {{currency}}
- Fecha de vencimiento: {{dueDate}}
- Días de retraso: {{daysOverdue}}

Si no recibimos tu pago en los próximos 3 días, nos veremos obligados a tomar acciones adicionales para recuperar el monto adeudado.

Te rogamos que regularices tu situación de inmediato.

Atentamente,
{{freelancerName}}`
      }
    ];
  }

  private async sendPaymentReminderEmail(reminder: PaymentReminder): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL || 'noreply@rizzup.app';

    if (!apiKey) {
      throw new Error('RESEND_API_KEY not configured');
    }

    const template = await this.getReminderTemplate(reminder.reminderType);
    const subject = this.substituteVariables(template.subject, reminder);
    const html = this.substituteVariables(template.body, reminder);

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: reminder.clientEmail, subject, html }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Failed to send reminder email: ${text}`);
    }
  }

  private async getReminderTemplate(type: string): Promise<{ subject: string; body: string }> {
    const templates = await this.getReminderTemplates();
    const template = templates.find(t => t.type === type);
    
    if (!template) {
      throw new Error(`Template not found for type: ${type}`);
    }

    return { subject: template.subject, body: template.body };
  }

  private calculateDaysOverdue(dueDate: Date): number {
    const now = new Date();
    const diffTime = now.getTime() - dueDate.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }

  private calculateDaysBeforeDue(dueDate: Date): number {
    const now = new Date();
    const diffTime = dueDate.getTime() - now.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }

  private getReminderType(daysOverdue: number): 'overdue_3' | 'overdue_7' | 'overdue_14' {
    if (daysOverdue <= 3) return 'overdue_3';
    if (daysOverdue <= 7) return 'overdue_7';
    return 'overdue_14';
  }

  private substituteVariables(text: string, reminder: PaymentReminder): string {
    return text
      .replace(/\{\{clientName\}\}/g, reminder.clientName)
      .replace(/\{\{invoiceNumber\}\}/g, reminder.invoiceNumber)
      .replace(/\{\{amount\}\}/g, reminder.amount.toString())
      .replace(/\{\{currency\}\}/g, 'EUR') // TODO: Get from invoice
      .replace(/\{\{dueDate\}\}/g, reminder.dueDate.toLocaleDateString())
      .replace(/\{\{daysOverdue\}\}/g, reminder.daysOverdue.toString())
      .replace(/\{\{daysBeforeDue\}\}/g, Math.abs(reminder.daysOverdue).toString())
      .replace(/\{\{freelancerName\}\}/g, 'Tu Freelancer'); // TODO: Get from user profile
  }

  private async getReminderRule(ruleId: string, userId: string): Promise<ReminderRule> {
    const rules = await this.getReminderRules(userId);
    const rule = rules.find(r => r.id === ruleId);
    
    if (!rule) {
      throw new Error('Reminder rule not found');
    }

    return rule;
  }
}
