import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from '../common/logger.service';
import { randomBytes } from 'crypto';

export interface ReferralCode {
  id: string;
  code: string;
  referrerId: string;
  isActive: boolean;
  rewardType: 'free_months' | 'percentage_discount' | 'fixed_amount';
  rewardValue: number;
  maxUses: number;
  currentUses: number;
  expiresAt?: Date;
  createdAt: Date;
}

export interface ReferralStats {
  totalReferrals: number;
  activeReferrals: number;
  convertedReferrals: number;
  totalRewards: number;
  pendingRewards: number;
  conversionRate: number;
}

export interface ReferralReward {
  id: string;
  referralId: string;
  refereeId: string;
  referrerId: string;
  type: 'free_months' | 'percentage_discount' | 'fixed_amount';
  value: number;
  status: 'pending' | 'granted' | 'expired';
  grantedAt?: Date;
  createdAt: Date;
}

// Temporary storage for referrals (in production, use database)
const referralCodes = new Map<string, ReferralCode>();
const referralRewards = new Map<string, ReferralReward>();

@Injectable()
export class ReferralsService {
  private readonly logger: AppLogger;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {
    this.logger = new AppLogger(config);
  }

  async createReferralCode(userId: string): Promise<ReferralCode> {
    // Generate unique referral code
    const code = this.generateReferralCode();
    
    // Check if code already exists
    if (Array.from(referralCodes.values()).some(r => r.code === code)) {
      return this.createReferralCode(userId); // Recursive retry
    }

    const referralCode: ReferralCode = {
      id: randomBytes(16).toString('hex'),
      code,
      referrerId: userId,
      isActive: true,
      rewardType: 'free_months',
      rewardValue: 3, // 3 free months
      maxUses: 50,
      currentUses: 0,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
      createdAt: new Date(),
    };

    referralCodes.set(referralCode.id, referralCode);

    this.logger.logBusinessEvent('referral_code_created', userId, {
      referralCodeId: referralCode.id,
      code,
      rewardType: referralCode.rewardType,
      rewardValue: referralCode.rewardValue,
    });

    return referralCode;
  }

  async getReferralCode(code: string): Promise<ReferralCode> {
    const referralCode = Array.from(referralCodes.values()).find(r => r.code === code);

    if (!referralCode || !referralCode.isActive) {
      throw new NotFoundException('Invalid referral code');
    }

    if (referralCode.expiresAt && referralCode.expiresAt < new Date()) {
      throw new NotFoundException('Referral code expired');
    }

    if (referralCode.currentUses >= referralCode.maxUses) {
      throw new NotFoundException('Referral code usage limit reached');
    }

    return referralCode;
  }

  async applyReferralCode(userId: string, code: string): Promise<void> {
    const referralCode = await this.getReferralCode(code);

    // Check if user is trying to refer themselves
    if (referralCode.referrerId === userId) {
      throw new ConflictException('Cannot use your own referral code');
    }

    // Check if user has already used a referral code
    const existingReward = Array.from(referralRewards.values())
      .find(r => r.refereeId === userId && r.status !== 'expired');
    
    if (existingReward) {
      throw new ConflictException('You have already used a referral code');
    }

    // Create referral reward for referrer
    const referrerReward: ReferralReward = {
      id: randomBytes(16).toString('hex'),
      referralId: referralCode.id,
      refereeId: userId,
      referrerId: referralCode.referrerId,
      type: referralCode.rewardType,
      value: referralCode.rewardValue,
      status: 'pending',
      createdAt: new Date(),
    };

    referralRewards.set(referrerReward.id, referrerReward);

    // Update referral code usage
    referralCode.currentUses++;
    if (referralCode.currentUses >= referralCode.maxUses) {
      referralCode.isActive = false;
    }

    this.logger.logBusinessEvent('referral_code_applied', userId, {
      referralCodeId: referralCode.id,
      code,
      referrerId: referralCode.referrerId,
      rewardType: referralCode.rewardType,
      rewardValue: referralCode.rewardValue,
    });

    // Grant instant reward to new user (referee)
    await this.grantInstantReward(userId, 'referee', referralCode.rewardType, referralCode.rewardValue);
  }

  async getReferralStats(userId: string): Promise<ReferralStats> {
    const userReferralCodes = Array.from(referralCodes.values())
      .filter(r => r.referrerId === userId);

    const userRewards = Array.from(referralRewards.values())
      .filter(r => r.referrerId === userId);

    const totalReferrals = userRewards.length;
    const convertedReferrals = userRewards.filter(r => r.status === 'granted').length;
    const totalRewards = userRewards.reduce((sum, r) => sum + r.value, 0);
    const pendingRewards = userRewards.filter(r => r.status === 'pending').length;
    const conversionRate = totalReferrals > 0 ? (convertedReferrals / totalReferrals) * 100 : 0;

    return {
      totalReferrals,
      activeReferrals: userReferralCodes.filter(r => r.isActive).length,
      convertedReferrals,
      totalRewards,
      pendingRewards,
      conversionRate,
    };
  }

  async getReferralCodeDetails(userId: string): Promise<ReferralCode[]> {
    return Array.from(referralCodes.values())
      .filter(r => r.referrerId === userId);
  }

  async getReferralHistory(userId: string): Promise<ReferralReward[]> {
    return Array.from(referralRewards.values())
      .filter(r => r.referrerId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async grantReward(rewardId: string): Promise<void> {
    const reward = referralRewards.get(rewardId);
    
    if (!reward || reward.status !== 'pending') {
      throw new NotFoundException('Reward not found or already processed');
    }

    // Update reward status
    reward.status = 'granted';
    reward.grantedAt = new Date();

    // Grant reward to referrer
    await this.grantInstantReward(reward.referrerId, 'referrer', reward.type, reward.value);

    this.logger.logBusinessEvent('referral_reward_granted', reward.referrerId, {
      rewardId,
      refereeId: reward.refereeId,
      type: reward.type,
      value: reward.value,
    });
  }

  private async grantInstantReward(userId: string, userType: 'referrer' | 'referee', type: string, value: number): Promise<void> {
    // In a real implementation, this would:
    // 1. Update user's subscription in RevenueCat
    // 2. Add free months to their account
    // 3. Apply discount to their billing
    // 4. Send notification email
    
    this.logger.logBusinessEvent('instant_reward_granted', userId, {
      userType,
      type,
      value,
    });
  }

  private generateReferralCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    
    // Generate 8-character code
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return code;
  }

  async validateReferralCode(code: string): Promise<{
    isValid: boolean;
    referralCode?: ReferralCode;
    error?: string;
  }> {
    try {
      const referralCode = await this.getReferralCode(code);
      return { isValid: true, referralCode };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error occurred';
      return { 
        isValid: false, 
        error: message 
      };
    }
  }

  async getTopReferrers(limit: number = 10): Promise<Array<{
    userId: string;
    totalReferrals: number;
    totalRewards: number;
    conversionRate: number;
  }>> {
    const referrerStats = new Map<string, {
      totalReferrals: number;
      totalRewards: number;
      convertedReferrals: number;
    }>();

    // Calculate stats for each referrer
    Array.from(referralRewards.values()).forEach(reward => {
      const existing = referrerStats.get(reward.referrerId) || {
        totalReferrals: 0,
        totalRewards: 0,
        convertedReferrals: 0,
      };

      existing.totalReferrals++;
      existing.totalRewards += reward.value;
      if (reward.status === 'granted') {
        existing.convertedReferrals++;
      }

      referrerStats.set(reward.referrerId, existing);
    });

    // Convert to array and sort by total referrals
    return Array.from(referrerStats.entries())
      .map(([userId, stats]) => ({
        userId,
        totalReferrals: stats.totalReferrals,
        totalRewards: stats.totalRewards,
        conversionRate: stats.totalReferrals > 0 ? (stats.convertedReferrals / stats.totalReferrals) * 100 : 0,
      }))
      .sort((a, b) => b.totalReferrals - a.totalReferrals)
      .slice(0, limit);
  }
}
