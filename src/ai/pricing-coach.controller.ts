import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  UseGuards,
  Query,
} from '@nestjs/common';
import { PricingCoachService } from './pricing-coach.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Request } from 'express';

type Authed = Request & { user: { sub: string } };

@Controller('v1/ai/pricing')
@UseGuards(JwtAuthGuard)
export class PricingCoachController {
  constructor(private readonly pricingCoach: PricingCoachService) {}

  @Post('analyze')
  async analyzePricing(
    @Req() req: Authed,
    @Body() request: {
      projectDescription: string;
      deliverables?: string[];
      hoursWorked?: number;
      hourlyRateCents?: number;
      quotedAmountCents: number;
      currency: string;
      clientType?: string;
      urgency?: string;
    },
  ) {
    return this.pricingCoach.analyzePricing(req.user.sub, request);
  }

  @Post('quick-pricing')
  async getQuickPricing(@Body() request: {
    projectType: 'website' | 'app' | 'content' | 'design' | 'marketing' | 'consulting';
    complexity: 'simple' | 'medium' | 'complex';
    timeline: 'urgent' | 'normal' | 'flexible';
    experience: 'junior' | 'intermediate' | 'senior';
    currency: string;
    region?: string;
  }) {
    return this.pricingCoach.getQuickPricing(request);
  }

  @Get('market-rates')
  async getMarketRates(
    @Query('projectType') projectType: string,
    @Query('region') region?: string,
  ) {
    return this.pricingCoach.getMarketRates(projectType, region);
  }

  @Get('history')
  async getPricingHistory(@Req() req: Authed) {
    return this.pricingCoach.getPricingHistory(req.user.sub);
  }

  @Get('improvements')
  async getImprovementSuggestions(@Req() req: Authed) {
    return this.pricingCoach.getImprovementSuggestions(req.user.sub);
  }
}
