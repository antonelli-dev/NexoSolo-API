import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { completeChat, type LlmProviderName } from './llm/complete-chat';

export interface PricingAnalysis {
  summary: string;
  fairnessScore: number;
  verdict: 'underpriced' | 'fair' | 'premium';
  suggestedRangeCents: {
    min: number;
    max: number;
  };
  reasons: string[];
  negotiationTips: string[];
  risksIfUnderpriced: string[];
  marketComparison: {
    averageRate: number;
    percentile: number;
    similarProjects: number;
  };
}

export interface QuickPricingRequest {
  projectType: 'website' | 'app' | 'content' | 'design' | 'marketing' | 'consulting';
  complexity: 'simple' | 'medium' | 'complex';
  timeline: 'urgent' | 'normal' | 'flexible';
  experience: 'junior' | 'intermediate' | 'senior';
  currency: string;
  region?: string;
}

@Injectable()
export class PricingCoachService {
  constructor(private prisma: PrismaService) {}

  async analyzePricing(userId: string, request: {
    projectDescription: string;
    deliverables?: string[];
    hoursWorked?: number;
    hourlyRateCents?: number;
    quotedAmountCents: number;
    currency: string;
    clientType?: string;
    urgency?: string;
  }): Promise<PricingAnalysis> {
    const cfg = this.getLlmConfig();
    
    const system = `You are a senior freelance business coach. Analyze pricing fairly and provide actionable advice.
Respond ONLY with a single JSON object (no markdown) with these exact keys:
summary (string, one sentence),
fairnessScore (number 0-100),
verdict (string: "underpriced" | "fair" | "premium"),
suggestedRangeCents (object { min: number, max: number }),
reasons (string[] max 5),
negotiationTips (string[] max 4),
risksIfUnderpriced (string[] max 3),
marketComparison (object { averageRate: number, percentile: number, similarProjects: number }).
Use cents for all amounts. Be realistic but encouraging.`;

    const user = JSON.stringify({
      projectDescription: request.projectDescription,
      deliverables: request.deliverables || null,
      hoursWorked: request.hoursWorked || null,
      hourlyRateCents: request.hourlyRateCents || null,
      quotedAmountCents: request.quotedAmountCents,
      currency: request.currency,
      clientType: request.clientType || null,
      urgency: request.urgency || null,
    });

    const raw = await this.runLlm({
      ...cfg,
      system,
      user,
      maxTokens: 2048,
    });

    return this.parseModelJson(raw) as unknown as PricingAnalysis;
  }

  async getQuickPricing(request: QuickPricingRequest): Promise<{
    suggestedRangeCents: { min: number; max: number };
    reasoning: string;
    keyFactors: string[];
    confidence: number;
  }> {
    const cfg = this.getLlmConfig();
    
    const system = `You are a pricing expert for freelancers. Provide quick pricing estimates based on project characteristics.
Respond ONLY with JSON keys:
suggestedRangeCents (object { min: number, max: number }),
reasoning (string, explain your logic),
keyFactors (string[] max 4, main factors affecting price),
confidence (number 0-100, how confident in this estimate).
Consider market rates, complexity, timeline, and experience level.`;

    const user = JSON.stringify(request);

    const raw = await this.runLlm({
      ...cfg,
      system,
      user,
      maxTokens: 1024,
    });

    return this.parseModelJson(raw) as unknown as {
      suggestedRangeCents: { min: number; max: number };
      reasoning: string;
      keyFactors: string[];
      confidence: number;
    };
  }

  async getMarketRates(projectType: string, region?: string): Promise<{
    averageHourly: number;
    averageProject: number;
    rateRange: { min: number; max: number };
    trend: 'increasing' | 'stable' | 'decreasing';
    sampleSize: number;
  }> {
    // Mock market data - in production, this would come from real market data
    const mockMarketData: Record<string, any> = {
      website: {
        averageHourly: 7500, // $75/hour in cents
        averageProject: 150000, // $1,500 project
        rateRange: { min: 5000, max: 15000 },
        trend: 'stable',
        sampleSize: 1250,
      },
      app: {
        averageHourly: 10000, // $100/hour
        averageProject: 500000, // $5,000 project
        rateRange: { min: 7500, max: 20000 },
        trend: 'increasing',
        sampleSize: 890,
      },
      content: {
        averageHourly: 6000, // $60/hour
        averageProject: 120000, // $1,200 project
        rateRange: { min: 4000, max: 10000 },
        trend: 'stable',
        sampleSize: 2100,
      },
      design: {
        averageHourly: 6500, // $65/hour
        averageProject: 180000, // $1,800 project
        rateRange: { min: 4500, max: 12000 },
        trend: 'increasing',
        sampleSize: 1560,
      },
      marketing: {
        averageHourly: 8000, // $80/hour
        averageProject: 250000, // $2,500 project
        rateRange: { min: 5500, max: 15000 },
        trend: 'increasing',
        sampleSize: 980,
      },
      consulting: {
        averageHourly: 12000, // $120/hour
        averageProject: 300000, // $3,000 project
        rateRange: { min: 8000, max: 25000 },
        trend: 'stable',
        sampleSize: 650,
      },
    };

    return mockMarketData[projectType] || mockMarketData.content;
  }

  async getPricingHistory(userId: string): Promise<Array<{
    id: string;
    projectType: string;
    quotedAmount: number;
    finalAmount?: number;
    date: Date;
    clientType: string;
    verdict: 'underpriced' | 'fair' | 'premium';
  }>> {
    // TODO: Get from database
    return [
      {
        id: '1',
        projectType: 'website',
        quotedAmount: 200000, // $2,000
        finalAmount: 220000, // $2,200
        date: new Date('2024-02-01'),
        clientType: 'startup',
        verdict: 'fair',
      },
      {
        id: '2',
        projectType: 'content',
        quotedAmount: 80000, // $800
        finalAmount: 80000,
        date: new Date('2024-02-15'),
        clientType: 'small_business',
        verdict: 'fair',
      },
    ];
  }

  async getImprovementSuggestions(userId: string): Promise<{
    overallScore: number;
    strengths: string[];
    improvements: string[];
    recommendedActions: string[];
    potentialIncrease: number; // percentage
  }> {
    // TODO: Analyze user's pricing history and provide personalized suggestions
    return {
      overallScore: 75,
      strengths: [
        'Consistent pricing across similar projects',
        'Good client retention rates',
        'Fair market positioning',
      ],
      improvements: [
        'Consider premium pricing for urgent projects',
        'Increase rates for complex deliverables',
        'Better scope documentation to justify higher prices',
      ],
      recommendedActions: [
        'Raise rates by 10-15% for new clients',
        'Create tiered pricing packages',
        'Add value-added services to justify premium pricing',
      ],
      potentialIncrease: 15,
    };
  }

  private async runLlm(input: Parameters<typeof completeChat>[0]): Promise<string> {
    try {
      return await completeChat(input);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`LLM Error: ${msg}`);
    }
  }

  private parseModelJson(raw: string): Record<string, unknown> {
    const trimmed = raw.trim();
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      throw new Error('Model did not return valid JSON');
    }
    return JSON.parse(trimmed.slice(start, end + 1));
  }

  private getLlmConfig(): {
    provider: LlmProviderName;
    apiKey: string;
    baseUrl?: string;
    model?: string;
  } {
    const provider = (process.env.AI_PROVIDER ?? 'openai').trim() as LlmProviderName;
    const apiKey = process.env.AI_API_KEY?.trim() ?? '';
    if (!apiKey) {
      throw new Error('AI not configured: Set AI_PROVIDER and AI_API_KEY');
    }
    return {
      provider,
      apiKey,
      baseUrl: process.env.AI_BASE_URL?.trim() || undefined,
      model: process.env.AI_MODEL?.trim() || undefined,
    };
  }
}
