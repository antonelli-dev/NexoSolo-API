import {
  Controller,
  Get,
  Req,
  UseGuards,
  Query,
} from '@nestjs/common';
import { GamificationService } from './gamification.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Request } from 'express';

type Authed = Request & { user: { sub: string } };

@Controller('v1/gamification')
@UseGuards(JwtAuthGuard)
export class GamificationController {
  constructor(private readonly gamification: GamificationService) {}

  @Get('streak')
  async getRevenueStreak(@Req() req: Authed) {
    return this.gamification.getRevenueStreak(req.user.sub);
  }

  @Get('milestones')
  async getMilestones(@Req() req: Authed) {
    return this.gamification.getMilestones(req.user.sub);
  }

  @Get('leaderboard')
  async getLeaderboard(
    @Req() req: Authed,
    @Query('category') category: 'revenue' | 'streak' | 'clients' | 'projects',
    @Query('period') period: 'weekly' | 'monthly' | 'all-time',
  ) {
    return this.gamification.getLeaderboard(category, period);
  }

  @Get('revenue-milestones')
  async getRevenueMilestones(@Req() req: Authed) {
    return this.gamification.getRevenueMilestones(req.user.sub);
  }

  @Get('leaderboard-categories')
  async getLeaderboardCategories(@Req() req: Authed) {
    return this.gamification.getLeaderboardCategories(req.user.sub);
  }

  @Get('streak-update')
  async updateStreak(@Req() req: Authed) {
    return this.gamification.updateStreak(req.user.sub);
  }
}
