import {
  Controller,
  Get,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Request } from 'express';

type Authed = Request & { user: { sub: string } };

@Controller('v1/analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('revenue')
  async getRevenueAnalytics(@Req() req: Authed) {
    return this.analytics.getRevenueAnalytics(req.user.sub);
  }

  @Get('clients')
  async getClientAnalytics(@Req() req: Authed) {
    return this.analytics.getClientAnalytics(req.user.sub);
  }

  @Get('projects')
  async getProjectAnalytics(@Req() req: Authed) {
    return this.analytics.getProjectAnalytics(req.user.sub);
  }

  @Get('market')
  async getMarketComparison(@Req() req: Authed) {
    return this.analytics.getMarketComparison(req.user.sub);
  }

  @Get('projections')
  async getRevenueProjections(@Req() req: Authed) {
    return this.analytics.getRevenueProjections(req.user.sub);
  }

  @Get('client-profitability')
  async getClientProfitability(@Req() req: Authed) {
    return this.analytics.getClientProfitability(req.user.sub);
  }

  @Get('advanced')
  async getAdvancedRevenueAnalytics(@Req() req: Authed) {
    return this.analytics.getAdvancedRevenueAnalytics(req.user.sub);
  }
}
