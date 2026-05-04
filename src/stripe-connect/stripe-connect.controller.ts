import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StripeConnectService } from './stripe-connect.service';
import { CreateStripeOnboardingLinkDto } from './dto/create-onboarding-link.dto';

type Authed = Request & { user: { sub: string } };

@Controller('v1/stripe-connect')
@UseGuards(JwtAuthGuard)
export class StripeConnectController {
  constructor(private readonly stripeConnect: StripeConnectService) {}

  @Get('status')
  getStatus(@Req() req: Authed) {
    return this.stripeConnect.getStatus(req.user.sub);
  }

  @Post('onboarding-link')
  createOnboardingLink(
    @Req() req: Authed,
    @Body() dto: CreateStripeOnboardingLinkDto,
  ) {
    return this.stripeConnect.createOnboardingLink(req.user.sub, dto);
  }
}
