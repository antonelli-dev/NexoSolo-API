import { Controller, Get, Post, Put, Param, Body, HttpException, HttpStatus, UseGuards, Req, Query, ParseUUIDPipe, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ReferralsService, ReferralCode, ReferralStats, ReferralReward } from './referrals.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Request } from 'express';

interface AuthedRequest extends Request {
  user: {
    sub: string;
    email: string;
  };
}

@ApiTags('Referrals')
@Controller('referrals')
@UseGuards(JwtAuthGuard)
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  @Post('create-code')
  @ApiOperation({ summary: 'Create a new referral code' })
  @ApiResponse({ status: 201, description: 'Referral code created successfully' })
  async createReferralCode(@Req() req: AuthedRequest): Promise<ReferralCode> {
    return this.referralsService.createReferralCode(req.user.sub);
  }

  @Get('my-codes')
  @ApiOperation({ summary: 'Get user\'s referral codes' })
  @ApiResponse({ status: 200, description: 'Referral codes retrieved successfully' })
  async getMyReferralCodes(@Req() req: AuthedRequest): Promise<ReferralCode[]> {
    return this.referralsService.getReferralCodeDetails(req.user.sub);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get referral statistics' })
  @ApiResponse({ status: 200, description: 'Referral stats retrieved successfully' })
  async getReferralStats(@Req() req: AuthedRequest): Promise<ReferralStats> {
    return this.referralsService.getReferralStats(req.user.sub);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get referral history' })
  @ApiResponse({ status: 200, description: 'Referral history retrieved successfully' })
  async getReferralHistory(@Req() req: AuthedRequest): Promise<ReferralReward[]> {
    return this.referralsService.getReferralHistory(req.user.sub);
  }

  @Post('apply')
  @ApiOperation({ summary: 'Apply a referral code' })
  @ApiResponse({ status: 200, description: 'Referral code applied successfully' })
  @ApiResponse({ status: 400, description: 'Invalid referral code' })
  async applyReferralCode(
    @Req() req: AuthedRequest,
    @Body() body: { code: string },
  ): Promise<{ success: boolean; message: string }> {
    try {
      await this.referralsService.applyReferralCode(req.user.sub, body.code);
      return { 
        success: true, 
        message: 'Referral code applied successfully! You\'ve been rewarded with 3 free months.' 
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new HttpException(message, HttpStatus.BAD_REQUEST);
    }
  }

  @Post('validate/:code')
  @ApiOperation({ summary: 'Validate a referral code (public endpoint)' })
  @ApiResponse({ status: 200, description: 'Referral code validation result' })
  async validateReferralCode(@Param('code') code: string): Promise<{
    isValid: boolean;
    error?: string;
    rewardInfo?: {
      type: string;
      value: number;
      description: string;
    };
  }> {
    const validation = await this.referralsService.validateReferralCode(code);
    
    if (validation.isValid && validation.referralCode) {
      return {
        isValid: true,
        rewardInfo: {
          type: validation.referralCode.rewardType,
          value: validation.referralCode.rewardValue,
          description: this.getRewardDescription(validation.referralCode.rewardType, validation.referralCode.rewardValue),
        },
      };
    }
    
    return { isValid: false, error: validation.error };
  }

  @Get('top-referrers')
  @ApiOperation({ summary: 'Get top referrers leaderboard' })
  @ApiResponse({ status: 200, description: 'Top referrers retrieved successfully' })
  async getTopReferrers(@Query('limit', new ParseIntPipe({ optional: true })) limit?: number): Promise<Array<{
    userId: string;
    totalReferrals: number;
    totalRewards: number;
    conversionRate: number;
  }>> {
    const limitNum = limit || 10;
    return this.referralsService.getTopReferrers(Math.min(limitNum, 50)); // Max 50 for performance
  }

  @Put('grant-reward/:rewardId')
  @ApiOperation({ summary: 'Grant a pending reward (admin only)' })
  @ApiResponse({ status: 200, description: 'Reward granted successfully' })
  async grantReward(@Param('rewardId', ParseUUIDPipe) rewardId: string): Promise<{ success: boolean }> {
    try {
      await this.referralsService.grantReward(rewardId);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new HttpException(message, HttpStatus.BAD_REQUEST);
    }
  }

  private getRewardDescription(type: string, value: number): string {
    switch (type) {
      case 'free_months':
        return `${value} free months of premium`;
      case 'percentage_discount':
        return `${value}% discount on subscription`;
      case 'fixed_amount':
        return `$${value} credit`;
      default:
        return `${value} reward points`;
    }
  }
}
