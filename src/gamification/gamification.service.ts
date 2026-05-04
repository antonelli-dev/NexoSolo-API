import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface RevenueStreak {
  current: number;
  longest: number;
  lastRevenueDate: Date;
  thisWeekRevenue: number;
  lastWeekRevenue: number;
  weeklyGoal: number;
  streakBonus: number;
}

export interface Milestone {
  id: string;
  name: string;
  description: string;
  target: number;
  current: number;
  achieved: boolean;
  achievedAt?: Date;
  category: 'daily' | 'weekly' | 'monthly' | 'total';
}

export interface LeaderboardEntry {
  userId: string;
  username: string;
  score: number;
  rank: number;
  badge?: string;
  revenue?: number;
  streak?: number;
  category?: string;
}

export interface RevenueMilestone {
  id: string;
  name: string;
  targetAmount: number;
  currency: string;
  period: 'monthly' | 'quarterly' | 'yearly' | 'all-time';
  badge: string;
  reward: string;
  achieved: boolean;
  achievedAt?: Date;
  progress: number;
}

export interface LeaderboardCategory {
  id: string;
  name: string;
  description: string;
  period: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  metric: 'revenue' | 'streak' | 'clients' | 'projects';
  entries: LeaderboardEntry[];
  userRank?: number;
}

@Injectable()
export class GamificationService {
  constructor(private prisma: PrismaService) {}

  async getRevenueStreak(userId: string): Promise<RevenueStreak> {
    // Get user's revenue data from invoices
    const invoices = await this.prisma.freelanceInvoice.findMany({
      where: { 
        project: { userId },
        status: 'paid'
      },
      include: { payments: true },
      orderBy: { createdAt: 'asc' }
    });

    // Calculate revenue by week
    const weeklyRevenue = this.calculateWeeklyRevenue(invoices);
    
    // Determine current streak
    const currentStreak = this.calculateCurrentStreak(weeklyRevenue);
    const longestStreak = this.calculateLongestStreak(weeklyRevenue);
    
    // Get this week and last week revenue
    const thisWeekRevenue = this.getWeekRevenue(weeklyRevenue, 0);
    const lastWeekRevenue = this.getWeekRevenue(weeklyRevenue, -1);
    
    // Calculate streak bonus (10% per week, max 50%)
    const streakBonus = Math.min(currentStreak * 0.1, 0.5);
    
    // Set weekly goal (average of last 4 weeks + 20%)
    const recentWeeks = weeklyRevenue.slice(-4);
    const avgRevenue = recentWeeks.reduce((sum, week) => sum + week.revenue, 0) / recentWeeks.length;
    const weeklyGoal = avgRevenue * 1.2;

    return {
      current: currentStreak,
      longest: longestStreak,
      lastRevenueDate: this.getLastRevenueDate(invoices),
      thisWeekRevenue,
      lastWeekRevenue,
      weeklyGoal,
      streakBonus
    };
  }

  async getMilestones(userId: string): Promise<Milestone[]> {
    // Get user's total revenue
    const totalRevenue = await this.getTotalRevenue(userId);
    
    // Define milestones
    const milestones: Milestone[] = [
      {
        id: 'first_100',
        name: 'Primeros $100',
        description: 'Genera tus primeros $100 en revenue',
        target: 100,
        current: Math.min(totalRevenue, 100),
        achieved: totalRevenue >= 100,
        achievedAt: totalRevenue >= 100 ? new Date() : undefined,
        category: 'total'
      },
      {
        id: 'first_500',
        name: '$500 Club',
        description: 'Alcanza $500 en revenue total',
        target: 500,
        current: Math.min(totalRevenue, 500),
        achieved: totalRevenue >= 500,
        achievedAt: totalRevenue >= 500 ? new Date() : undefined,
        category: 'total'
      },
      {
        id: 'first_1000',
        name: 'Figura de 4 Dígitos',
        description: 'Genera $1,000 en revenue',
        target: 1000,
        current: Math.min(totalRevenue, 1000),
        achieved: totalRevenue >= 1000,
        achievedAt: totalRevenue >= 1000 ? new Date() : undefined,
        category: 'total'
      },
      {
        id: 'first_5000',
        name: 'Generador de 5 Dígitos',
        description: 'Alcanza $5,000 en revenue',
        target: 5000,
        current: Math.min(totalRevenue, 5000),
        achieved: totalRevenue >= 5000,
        achievedAt: totalRevenue >= 5000 ? new Date() : undefined,
        category: 'total'
      },
      {
        id: 'weekly_500',
        name: 'Semanal Productiva',
        description: 'Genera $500 en una semana',
        target: 500,
        current: await this.getBestWeekRevenue(userId),
        achieved: await this.getBestWeekRevenue(userId) >= 500,
        achievedAt: await this.getBestWeekRevenue(userId) >= 500 ? new Date() : undefined,
        category: 'weekly'
      },
      {
        id: 'monthly_2000',
        name: 'Mes Exitoso',
        description: 'Genera $2,000 en un mes',
        target: 2000,
        current: await this.getBestMonthRevenue(userId),
        achieved: await this.getBestMonthRevenue(userId) >= 2000,
        achievedAt: await this.getBestMonthRevenue(userId) >= 2000 ? new Date() : undefined,
        category: 'monthly'
      }
    ];

    return milestones;
  }

  async updateStreak(userId: string): Promise<RevenueStreak> {
    // This would be called when a new payment is recorded
    return this.getRevenueStreak(userId);
  }

  private calculateWeeklyRevenue(invoices: any[]): Array<{ week: number; revenue: number; date: Date }> {
    const weeklyMap = new Map<number, number>();
    
    invoices.forEach(invoice => {
      const weekNumber = this.getWeekNumber(invoice.createdAt);
      const revenue = invoice.payments.reduce((sum: number, payment: any) => sum + Number(payment.amount), 0);
      
      weeklyMap.set(weekNumber, (weeklyMap.get(weekNumber) || 0) + revenue);
    });

    return Array.from(weeklyMap.entries()).map(([week, revenue]) => ({
      week,
      revenue,
      date: this.getWeekDate(week)
    })).sort((a, b) => a.week - b.week);
  }

  private calculateCurrentStreak(weeklyRevenue: Array<{ week: number; revenue: number }>): number {
    if (weeklyRevenue.length === 0) return 0;
    
    const currentWeek = this.getWeekNumber(new Date());
    let streak = 0;
    
    for (let i = 0; i < weeklyRevenue.length; i++) {
      const weekIndex = weeklyRevenue.length - 1 - i;
      const week = weeklyRevenue[weekIndex];
      
      if (week.week === currentWeek - i && week.revenue > 0) {
        streak++;
      } else {
        break;
      }
    }
    
    return streak;
  }

  private calculateLongestStreak(weeklyRevenue: Array<{ week: number; revenue: number }>): number {
    let longest = 0;
    let current = 0;
    
    weeklyRevenue.forEach(week => {
      if (week.revenue > 0) {
        current++;
        longest = Math.max(longest, current);
      } else {
        current = 0;
      }
    });
    
    return longest;
  }

  private getWeekRevenue(weeklyRevenue: Array<{ week: number; revenue: number }>, weekOffset: number): number {
    const targetWeek = this.getWeekNumber(new Date()) + weekOffset;
    const weekData = weeklyRevenue.find(w => w.week === targetWeek);
    return weekData?.revenue || 0;
  }

  private getLastRevenueDate(invoices: any[]): Date {
    if (invoices.length === 0) return new Date(0);
    
    const lastInvoice = invoices.reduce((latest, invoice) => {
      const invoiceDate = invoice.payments.length > 0 
        ? new Date(Math.max(...invoice.payments.map((p: any) => new Date(p.createdAt))))
        : invoice.createdAt;
      return invoiceDate > latest ? invoiceDate : latest;
    }, new Date(0));
    
    return lastInvoice;
  }

  async getRevenueMilestones(userId: string): Promise<RevenueMilestone[]> {
  const userRevenue = await this.getUserRevenueData(userId);
  const milestones = this.getRevenueMilestoneDefinitions();
  
  return milestones.map(milestone => {
    const revenue = this.getRevenueByPeriod(userRevenue, milestone.period);
    const progress = Math.min((revenue / milestone.targetAmount) * 100, 100);
    const achieved = revenue >= milestone.targetAmount;
    
    return {
      ...milestone,
      achieved,
      progress,
      achievedAt: achieved ? new Date() : undefined,
    };
  });
}

async getLeaderboard(metric: 'revenue' | 'streak' | 'clients' | 'projects', period: 'weekly' | 'monthly' | 'all-time'): Promise<LeaderboardEntry[]> {
    return this.getLeaderboardEntries(metric, period);
  }

  async getLeaderboardCategories(userId: string): Promise<LeaderboardCategory[]> {
  const categories = [
    {
      id: 'revenue_weekly',
      name: 'Weekly Revenue',
      description: 'Top earners this week',
      period: 'weekly' as const,
      metric: 'revenue' as const,
    },
    {
      id: 'revenue_monthly',
      name: 'Monthly Revenue',
      description: 'Top earners this month',
      period: 'monthly' as const,
      metric: 'revenue' as const,
    },
    {
      id: 'streak_weekly',
      name: 'Revenue Streaks',
      description: 'Longest revenue streaks',
      period: 'weekly' as const,
      metric: 'streak' as const,
    },
    {
      id: 'clients_monthly',
      name: 'Client Acquisition',
      description: 'Most new clients this month',
      period: 'monthly' as const,
      metric: 'clients' as const,
    },
    {
      id: 'projects_monthly',
      name: 'Project Completion',
      description: 'Most projects completed this month',
      period: 'monthly' as const,
      metric: 'projects' as const,
    },
  ];

  return Promise.all(categories.map(async category => {
    const entries = await this.getLeaderboardEntries(category.metric, category.period);
    const userRank = entries.find(entry => entry.userId === userId)?.rank;
    
    return {
      ...category,
      entries,
      userRank,
    };
  }));
}

private async getUserRevenueData(userId: string) {
    const invoices = await this.prisma.freelanceInvoice.findMany({
      where: { 
        project: { userId },
        status: 'paid'
      },
      include: { payments: true },
      orderBy: { createdAt: 'asc' }
    });

    return invoices;
  }

  private getRevenueMilestoneDefinitions(): RevenueMilestone[] {
    return [
      {
        id: 'monthly_1k',
        name: 'Monthly $1K',
        targetAmount: 1000,
        currency: 'USD',
        period: 'monthly',
        badge: 'bronze',
        reward: 'Bronze badge + 5% streak bonus',
        achieved: false,
        progress: 0,
      },
      {
        id: 'monthly_5k',
        name: 'Monthly $5K',
        targetAmount: 5000,
        currency: 'USD',
        period: 'monthly',
        badge: 'silver',
        reward: 'Silver badge + 10% streak bonus',
        achieved: false,
        progress: 0,
      },
      {
        id: 'monthly_10k',
        name: 'Monthly $10K',
        targetAmount: 10000,
        currency: 'USD',
        period: 'monthly',
        badge: 'gold',
        reward: 'Gold badge + 15% streak bonus',
        achieved: false,
        progress: 0,
      },
      {
        id: 'quarterly_15k',
        name: 'Quarterly $15K',
        targetAmount: 15000,
        currency: 'USD',
        period: 'quarterly',
        badge: 'platinum',
        reward: 'Platinum badge + 20% streak bonus',
        achieved: false,
        progress: 0,
      },
      {
        id: 'yearly_50k',
        name: 'Yearly $50K',
        targetAmount: 50000,
        currency: 'USD',
        period: 'yearly',
        badge: 'diamond',
        reward: 'Diamond badge + 25% streak bonus',
        achieved: false,
        progress: 0,
      },
      {
        id: 'alltime_100k',
        name: 'All-Time $100K',
        targetAmount: 100000,
        currency: 'USD',
        period: 'all-time',
        badge: 'legendary',
        reward: 'Legendary badge + 30% streak bonus',
        achieved: false,
        progress: 0,
      },
    ];
  }

  private getRevenueByPeriod(invoices: any[], period: 'monthly' | 'quarterly' | 'yearly' | 'all-time'): number {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'monthly':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'quarterly':
        const quarter = Math.floor(now.getMonth() / 3);
        startDate = new Date(now.getFullYear(), quarter * 3, 1);
        break;
      case 'yearly':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      case 'all-time':
        startDate = new Date(0); // Beginning of time
        break;
    }

    return invoices
      .filter(invoice => new Date(invoice.createdAt) >= startDate)
      .reduce((sum, invoice) => {
        const paid = invoice.payments.reduce((s: number, p: any) => s + Number(p.amount), 0);
        return sum + paid;
      }, 0);
  }

  private async getLeaderboardEntries(metric: 'revenue' | 'streak' | 'clients' | 'projects', period: 'weekly' | 'monthly' | 'all-time'): Promise<LeaderboardEntry[]> {
    // Mock data - in production this would query actual user data
    const mockUsers = [
      { id: '1', username: 'freelancer_pro', revenue: 15000, streak: 8, clients: 12, projects: 15 },
      { id: '2', username: 'design_master', revenue: 12000, streak: 6, clients: 8, projects: 10 },
      { id: '3', username: 'code_ninja', revenue: 10000, streak: 4, clients: 6, projects: 8 },
      { id: '4', username: 'creative_expert', revenue: 8000, streak: 3, clients: 5, projects: 6 },
      { id: '5', username: 'startup_guru', revenue: 6000, streak: 2, clients: 4, projects: 5 },
    ];

    let entries = mockUsers.map((user, index) => ({
      userId: user.id,
      username: user.username,
      score: user[metric] as number,
      rank: index + 1,
      badge: this.getBadgeForRank(index + 1),
      revenue: metric === 'revenue' ? user.revenue : undefined,
      streak: metric === 'streak' ? user.streak : undefined,
      category: metric,
    }));

    // Sort by score descending
    entries.sort((a, b) => b.score - a.score);
    
    // Update ranks
    entries.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    return entries;
  }

  private getBadgeForRank(rank: number): string {
    switch (rank) {
      case 1: return 'gold';
      case 2: return 'silver';
      case 3: return 'bronze';
      default: return '';
    }
  }

  private async getTotalRevenue(userId: string): Promise<number> {
    const invoices = await this.prisma.freelanceInvoice.findMany({
      where: { 
        project: { userId },
        status: 'paid'
      },
      include: { payments: true }
    });

    return invoices.reduce((total, invoice) => {
      const paid = invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
      return total + paid;
    }, 0);
  }

  private async getBestWeekRevenue(userId: string): Promise<number> {
    const weeklyRevenue = await this.getWeeklyRevenueData(userId);
    return Math.max(...weeklyRevenue.map(w => w.revenue), 0);
  }

  private async getBestMonthRevenue(userId: string): Promise<number> {
    const invoices = await this.prisma.freelanceInvoice.findMany({
      where: { 
        project: { userId },
        status: 'paid'
      },
      include: { payments: true }
    });

    const monthlyRevenue = new Map<number, number>();
    
    invoices.forEach(invoice => {
      const month = invoice.createdAt.getMonth();
      const year = invoice.createdAt.getFullYear();
      const monthKey = year * 12 + month;
      
      const revenue = invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
      monthlyRevenue.set(monthKey, (monthlyRevenue.get(monthKey) || 0) + revenue);
    });

    return Math.max(...monthlyRevenue.values(), 0);
  }

  private async getWeeklyRevenueData(userId: string): Promise<Array<{ week: number; revenue: number }>> {
    const invoices = await this.prisma.freelanceInvoice.findMany({
      where: { 
        project: { userId },
        status: 'paid'
      },
      include: { payments: true }
    });

    const weeklyMap = new Map<number, number>();
    
    invoices.forEach(invoice => {
      const weekNumber = this.getWeekNumber(invoice.createdAt);
      const revenue = invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
      weeklyMap.set(weekNumber, (weeklyMap.get(weekNumber) || 0) + revenue);
    });

    return Array.from(weeklyMap.entries()).map(([week, revenue]) => ({ week, revenue }));
  }

  private getWeekNumber(date: Date): number {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }

  private getWeekDate(weekNumber: number): Date {
    const firstDayOfYear = new Date(new Date().getFullYear(), 0, 1);
    const days = (weekNumber - 1) * 7 - firstDayOfYear.getDay();
    return new Date(firstDayOfYear.getTime() + days * 86400000);
  }
}
