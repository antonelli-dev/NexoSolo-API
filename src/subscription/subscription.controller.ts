import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Req,
  UseGuards,
  Param,
} from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Request } from 'express';

type Authed = Request & { user: { sub: string } };

@Controller('v1/subscription')
@UseGuards(JwtAuthGuard)
export class SubscriptionController {
  constructor(private readonly subscription: SubscriptionService) {}

  @Get('plans')
  async getPlans() {
    return this.subscription.getPlans();
  }

  @Get('current')
  async getUserSubscription(@Req() req: Authed) {
    return this.subscription.getUserSubscription(req.user.sub);
  }

  @Get('usage')
  async getUserUsage(@Req() req: Authed) {
    return this.subscription.getUserUsage(req.user.sub);
  }

  @Get('check/:feature')
  async checkFeatureAccess(
    @Req() req: Authed,
    @Param('feature') feature: string,
  ) {
    return this.subscription.checkFeatureAccess(req.user.sub, feature);
  }

  @Get('require/:plan')
  async requireSubscription(
    @Req() req: Authed,
    @Param('plan') plan: 'free' | 'pro' | 'business',
  ) {
    return this.subscription.requireSubscription(req.user.sub, plan);
  }

  @Post('create')
  async createSubscription(
    @Req() req: Authed,
    @Body('planId') planId: string,
  ) {
    return this.subscription.createSubscription(req.user.sub, planId);
  }

  @Put('update')
  async updateSubscription(
    @Req() req: Authed,
    @Body('planId') planId: string,
  ) {
    return this.subscription.updateSubscription(req.user.sub, planId);
  }

  @Delete('cancel')
  async cancelSubscription(
    @Req() req: Authed,
    @Body('cancelAtPeriodEnd') cancelAtPeriodEnd?: boolean,
  ) {
    return this.subscription.cancelSubscription(req.user.sub, cancelAtPeriodEnd);
  }

  @Post('reactivate')
  async reactivateSubscription(@Req() req: Authed) {
    return this.subscription.reactivateSubscription(req.user.sub);
  }

  @Get('history')
  async getSubscriptionHistory(@Req() req: Authed) {
    return this.subscription.getSubscriptionHistory(req.user.sub);
  }

  @Get('billing')
  async getBillingInfo(@Req() req: Authed) {
    return this.subscription.getBillingInfo(req.user.sub);
  }

  @Put('payment-method')
  async updatePaymentMethod(
    @Req() req: Authed,
    @Body('paymentMethodId') paymentMethodId: string,
  ) {
    return this.subscription.updatePaymentMethod(req.user.sub, paymentMethodId);
  }
}
