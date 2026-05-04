import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface RevenueAnalytics {
  monthlyRevenue: number[];
  totalRevenue: number;
  averageMonthlyRevenue: number;
  growthRate: number;
}

export interface ClientAnalytics {
  totalClients: number;
  activeClients: number;
  newClientsThisMonth: number;
  retentionRate: number;
  topClients: Array<{
    id: string;
    name: string;
    revenue: number;
    projects: number;
  }>;
}

export interface ProjectAnalytics {
  totalProjects: number;
  completedProjects: number;
  averageProjectValue: number;
  averageProjectDuration: number;
  profitabilityByType: Array<{
    type: string;
    revenue: number;
    profit: number;
    count: number;
  }>;
}

export interface MarketComparison {
  userAverageRate: number;
  marketAverageRate: number;
  percentile: number;
  competitors: Array<{
    name: string;
    rate: number;
    specialty: string;
  }>;
}

export interface RevenueProjections {
  monthlyProjection: number;
  quarterlyProjection: number;
  yearlyProjection: number;
  confidence: number;
  factors: Array<{
    factor: string;
    impact: number;
    trend: 'increasing' | 'decreasing' | 'stable';
  }>;
  scenarios: {
    optimistic: number;
    realistic: number;
    pessimistic: number;
  };
}

export interface ClientProfitability {
  id: string;
  name: string;
  totalRevenue: number;
  totalCosts: number;
  profit: number;
  profitMargin: number;
  projects: number;
  avgProjectValue: number;
  lastPaymentDate: Date;
  paymentReliability: number;
  profitability: 'high' | 'medium' | 'low';
  recommendations: string[];
}

export interface AdvancedRevenueAnalytics {
  revenueProjections: RevenueProjections;
  clientProfitability: ClientProfitability[];
  revenueByMonth: Array<{
    month: string;
    revenue: number;
    projected: boolean;
  }>;
  topPerformingServices: Array<{
    service: string;
    revenue: number;
    projects: number;
    avgRate: number;
    growth: number;
  }>;
  seasonalityPatterns: Array<{
    month: number;
    avgRevenue: number;
    variance: number;
    trend: 'peak' | 'low' | 'normal';
  }>;
}

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getRevenueAnalytics(userId: string): Promise<RevenueAnalytics> {
    const invoices = await this.prisma.freelanceInvoice.findMany({
      where: { project: { userId } },
      include: { payments: true },
    });

    const monthlyRevenue = this.calculateMonthlyRevenue(invoices);
    const totalRevenue = monthlyRevenue.reduce((sum, rev) => sum + rev, 0);
    const averageMonthlyRevenue = totalRevenue / monthlyRevenue.length || 0;
    const growthRate = this.calculateGrowthRate(monthlyRevenue);

    return {
      monthlyRevenue,
      totalRevenue,
      averageMonthlyRevenue,
      growthRate,
    };
  }

  async getClientAnalytics(userId: string): Promise<ClientAnalytics> {
    const clients = await this.prisma.freelanceClient.findMany({
      where: { userId },
      include: {
        projects: {
          include: { invoices: { include: { payments: true } } }
        }
      },
    });

    const totalClients = clients.length;
    const activeClients = clients.filter(c => 
      c.projects.some(p => p.status !== 'archived')
    ).length;
    
    const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const newClientsThisMonth = clients.filter(c => 
      c.createdAt >= oneMonthAgo
    ).length;

    const retentionRate = this.calculateRetentionRate(clients);
    
    const topClients = clients
      .map(client => ({
        id: client.id,
        name: client.name,
        revenue: client.projects.reduce((sum, project) => 
          sum + project.invoices.reduce((invSum, invoice) => 
            invSum + Number(invoice.amount), 0
          ), 0
        ),
        projects: client.projects.length,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    return {
      totalClients,
      activeClients,
      newClientsThisMonth,
      retentionRate,
      topClients,
    };
  }

  async getProjectAnalytics(userId: string): Promise<ProjectAnalytics> {
    const projects = await this.prisma.freelanceProject.findMany({
      where: { userId },
      include: { invoices: true },
    });

    const totalProjects = projects.length;
    const completedProjects = projects.filter(p => p.status === 'paid').length;
    const averageProjectValue = projects.reduce((sum, p) => 
      sum + p.invoices.reduce((invSum, inv) => invSum + Number(inv.amount), 0), 0
    ) / totalProjects || 0;

    const averageProjectDuration = this.calculateAverageProjectDuration(projects);
    
    const profitabilityByType = this.calculateProfitabilityByType(projects);

    return {
      totalProjects,
      completedProjects,
      averageProjectValue,
      averageProjectDuration,
      profitabilityByType,
    };
  }

  async getMarketComparison(userId: string): Promise<MarketComparison> {
    // TODO: Implementar comparación con datos del mercado
    const userRate = await this.getUserAverageRate(userId);
    const marketAverageRate = 2500; // Mock data
    const percentile = (userRate / marketAverageRate) * 100;

    return {
      userAverageRate: userRate,
      marketAverageRate,
      percentile: Math.min(percentile, 100),
      competitors: [
        { name: "Developer A", rate: 2800, specialty: "Web Development" },
        { name: "Designer B", rate: 2200, specialty: "UI/UX Design" },
        { name: "Freelancer C", rate: 3000, specialty: "Full Stack" },
      ],
    };
  }

  private calculateMonthlyRevenue(invoices: any[]): number[] {
    const monthlyData: { [key: string]: number } = {};
    
    invoices.forEach(invoice => {
      const monthKey = invoice.createdAt.toISOString().slice(0, 7);
      monthlyData[monthKey] = (monthlyData[monthKey] || 0) + Number(invoice.amount);
    });

    return Object.values(monthlyData);
  }

  private calculateGrowthRate(monthlyRevenue: number[]): number {
    if (monthlyRevenue.length < 2) return 0;
    const latest = monthlyRevenue[monthlyRevenue.length - 1];
    const previous = monthlyRevenue[monthlyRevenue.length - 2];
    return previous > 0 ? ((latest - previous) / previous) * 100 : 0;
  }

  private calculateRetentionRate(clients: any[]): number {
    const activeClients = clients.filter(c => 
      c.projects.some((p: any) => p.status !== 'archived')
    ).length;
    return clients.length > 0 ? (activeClients / clients.length) * 100 : 0;
  }

  private calculateAverageProjectDuration(projects: any[]): number {
    const completedProjects = projects.filter((p: any) => 
      p.status === 'paid' && p.createdAt && p.updatedAt
    );
    
    if (completedProjects.length === 0) return 0;
    
    const totalDays = completedProjects.reduce((sum, project) => {
      const start = new Date(project.createdAt);
      const end = new Date(project.updatedAt);
      return sum + Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    }, 0);
    
    return totalDays / completedProjects.length;
  }

  private calculateProfitabilityByType(projects: any[]) {
    const typeData: { [key: string]: { revenue: number; count: number } } = {};
    
    projects.forEach(project => {
      const type = 'General'; // TODO: Add project type field
      const revenue = project.invoices.reduce((sum: number, inv: any) => 
        sum + Number(inv.amount), 0
      );
      
      if (!typeData[type]) {
        typeData[type] = { revenue: 0, count: 0 };
      }
      typeData[type].revenue += revenue;
      typeData[type].count += 1;
    });

    return Object.entries(typeData).map(([type, data]) => ({
      type,
      revenue: data.revenue,
      profit: data.revenue * 0.7, // Assume 70% profit margin
      count: data.count,
    }));
  }

  async getRevenueProjections(userId: string): Promise<RevenueProjections> {
    const revenueAnalytics = await this.getRevenueAnalytics(userId);
    const monthlyRevenue = revenueAnalytics.monthlyRevenue;
    
    if (monthlyRevenue.length < 3) {
      return {
        monthlyProjection: monthlyRevenue[monthlyRevenue.length - 1] || 0,
        quarterlyProjection: 0,
        yearlyProjection: 0,
        confidence: 20,
        factors: [],
        scenarios: {
          optimistic: 0,
          realistic: 0,
          pessimistic: 0,
        },
      };
    }

    // Calculate growth trend
    const recentMonths = monthlyRevenue.slice(-3);
    const avgRecentRevenue = recentMonths.reduce((sum, rev) => sum + rev, 0) / recentMonths.length;
    const growthRate = this.calculateGrowthRate(monthlyRevenue);
    
    // Project future revenue
    const monthlyProjection = avgRecentRevenue * (1 + growthRate / 100);
    const quarterlyProjection = monthlyProjection * 3;
    const yearlyProjection = monthlyProjection * 12;

    // Calculate confidence based on data consistency
    const variance = this.calculateVariance(recentMonths);
    const confidence = Math.max(20, Math.min(95, 100 - (variance / avgRecentRevenue) * 100));

    // Identify influencing factors
    const factors = await this.analyzeInfluencingFactors(userId);

    // Calculate scenarios
    const scenarios = {
      optimistic: monthlyProjection * (1 + Math.abs(growthRate) / 100),
      realistic: monthlyProjection,
      pessimistic: monthlyProjection * (1 - Math.abs(growthRate) / 100),
    };

    return {
      monthlyProjection,
      quarterlyProjection,
      yearlyProjection,
      confidence,
      factors,
      scenarios,
    };
  }

  async getClientProfitability(userId: string): Promise<ClientProfitability[]> {
    const clients = await this.prisma.freelanceClient.findMany({
      where: { userId },
      include: {
        projects: {
          include: { invoices: { include: { payments: true } } }
        }
      },
    });

    return clients.map(client => {
      const totalRevenue = client.projects.reduce((sum, project) => 
        sum + project.invoices.reduce((invSum, invoice) => 
          invSum + Number(invoice.amount), 0
        ), 0
      );

      // Mock costs - in production this would track actual expenses
      const totalCosts = totalRevenue * 0.3; // Assume 30% costs
      const profit = totalRevenue - totalCosts;
      const profitMargin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

      // Calculate payment reliability
      const totalInvoices = client.projects.reduce((sum, project) => sum + project.invoices.length, 0);
      const paidInvoices = client.projects.reduce((sum, project) => 
        sum + project.invoices.filter(inv => inv.status === 'paid').length, 0
      );
      const paymentReliability = totalInvoices > 0 ? (paidInvoices / totalInvoices) * 100 : 0;

      // Determine profitability level
      let profitability: 'high' | 'medium' | 'low';
      if (profitMargin > 40) profitability = 'high';
      else if (profitMargin > 20) profitability = 'medium';
      else profitability = 'low';

      // Generate recommendations
      const recommendations = this.generateClientRecommendations(profitability, paymentReliability, totalRevenue);

      return {
        id: client.id,
        name: client.name,
        totalRevenue,
        totalCosts,
        profit,
        profitMargin,
        projects: client.projects.length,
        avgProjectValue: client.projects.length > 0 ? totalRevenue / client.projects.length : 0,
        lastPaymentDate: new Date(), // TODO: Get actual last payment date
        paymentReliability,
        profitability,
        recommendations,
      };
    }).sort((a, b) => b.profit - a.profit);
  }

  async getAdvancedRevenueAnalytics(userId: string): Promise<AdvancedRevenueAnalytics> {
    const revenueProjections = await this.getRevenueProjections(userId);
    const clientProfitability = await this.getClientProfitability(userId);
    const revenueByMonth = await this.getRevenueByMonthWithProjections(userId);
    const topPerformingServices = await this.getTopPerformingServices(userId);
    const seasonalityPatterns = await this.analyzeSeasonalityPatterns(userId);

    return {
      revenueProjections,
      clientProfitability,
      revenueByMonth,
      topPerformingServices,
      seasonalityPatterns,
    };
  }

  private async getRevenueByMonthWithProjections(userId: string) {
    const invoices = await this.prisma.freelanceInvoice.findMany({
      where: { project: { userId } },
      include: { payments: true },
      orderBy: { createdAt: 'asc' },
    });

    const monthlyData: { [key: string]: number } = {};
    
    invoices.forEach(invoice => {
      const monthKey = invoice.createdAt.toISOString().slice(0, 7);
      const paid = invoice.payments.reduce((s, p) => s + Number(p.amount), 0);
      monthlyData[monthKey] = (monthlyData[monthKey] || 0) + paid;
    });

    // Add projections for future months
    const projections = await this.getRevenueProjections(userId);
    const currentMonth = new Date().toISOString().slice(0, 7);
    
    const result = Object.entries(monthlyData).map(([month, revenue]) => ({
      month,
      revenue,
      projected: false,
    }));

    // Add 3 months of projections
    for (let i = 1; i <= 3; i++) {
      const date = new Date();
      date.setMonth(date.getMonth() + i);
      const monthKey = date.toISOString().slice(0, 7);
      result.push({
        month: monthKey,
        revenue: projections.monthlyProjection,
        projected: true,
      });
    }

    return result;
  }

  private async getTopPerformingServices(userId: string) {
    // Mock data - in production this would categorize projects by service type
    return [
      {
        service: 'Web Development',
        revenue: 15000,
        projects: 5,
        avgRate: 3000,
        growth: 15,
      },
      {
        service: 'UI/UX Design',
        revenue: 8000,
        projects: 8,
        avgRate: 1000,
        growth: 8,
      },
      {
        service: 'Content Writing',
        revenue: 5000,
        projects: 10,
        avgRate: 500,
        growth: -5,
      },
    ];
  }

  private async analyzeSeasonalityPatterns(userId: string) {
    const revenueAnalytics = await this.getRevenueAnalytics(userId);
    const monthlyRevenue = revenueAnalytics.monthlyRevenue;
    
    // Mock seasonality data - in production this would analyze actual patterns
    return [
      { month: 1, avgRevenue: 3000, variance: 500, trend: 'low' as const },
      { month: 2, avgRevenue: 3500, variance: 600, trend: 'normal' as const },
      { month: 3, avgRevenue: 4500, variance: 800, trend: 'peak' as const },
      { month: 4, avgRevenue: 4000, variance: 700, trend: 'normal' as const },
      { month: 5, avgRevenue: 3800, variance: 650, trend: 'normal' as const },
      { month: 6, avgRevenue: 3200, variance: 550, trend: 'low' as const },
      { month: 7, avgRevenue: 3000, variance: 500, trend: 'low' as const },
      { month: 8, avgRevenue: 3500, variance: 600, trend: 'normal' as const },
      { month: 9, avgRevenue: 4200, variance: 750, trend: 'peak' as const },
      { month: 10, avgRevenue: 4000, variance: 700, trend: 'normal' as const },
      { month: 11, avgRevenue: 4500, variance: 800, trend: 'peak' as const },
      { month: 12, avgRevenue: 5000, variance: 900, trend: 'peak' as const },
    ];
  }

  private calculateVariance(values: number[]): number {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    return squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
  }

  private async analyzeInfluencingFactors(userId: string) {
    // Mock analysis - in production this would analyze actual factors
    return [
      { factor: 'Seasonal demand', impact: 15, trend: 'increasing' as const },
      { factor: 'Client retention', impact: -5, trend: 'stable' as const },
      { factor: 'Market rates', impact: 8, trend: 'increasing' as const },
    ];
  }

  private generateClientRecommendations(profitability: string, paymentReliability: number, totalRevenue: number): string[] {
    const recommendations: string[] = [];

    if (profitability === 'low') {
      recommendations.push('Consider increasing rates for this client');
      recommendations.push('Review project scope to ensure profitability');
    }

    if (paymentReliability < 80) {
      recommendations.push('Implement stricter payment terms');
      recommendations.push('Require upfront payments for new projects');
    }

    if (totalRevenue > 10000) {
      recommendations.push('This is a high-value client - prioritize retention');
      recommendations.push('Consider offering retainer agreements');
    }

    if (recommendations.length === 0) {
      recommendations.push('Client performs well - maintain current relationship');
    }

    return recommendations;
  }

  private async getUserAverageRate(userId: string): Promise<number> {
    const projects = await this.prisma.freelanceProject.findMany({
      where: { userId },
      include: { invoices: true },
    });

    if (projects.length === 0) return 0;

    const totalRevenue = projects.reduce((sum, project) => 
      sum + project.invoices.reduce((invSum, inv) => invSum + Number(inv.amount), 0), 0
    );

    return totalRevenue / projects.length;
  }
}
