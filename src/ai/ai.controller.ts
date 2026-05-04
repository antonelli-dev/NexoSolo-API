import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiService } from './ai.service';
import { BriefAmbiguityDto } from './dto/brief-ambiguity.dto';
import { BriefToScopeDto } from './dto/brief-to-scope.dto';
import { FairnessCheckDto } from './dto/fairness-check.dto';
import { InvoiceChaseMessageDto } from './dto/invoice-chase-message.dto';
import { PricingCoachDto } from './dto/pricing-coach.dto';
import { RewriteScopeDto } from './dto/rewrite-scope.dto';
import { ScopeRiskLineDto } from './dto/scope-risk-line.dto';

type Authed = Request & { user: { sub: string } };

@Controller('v1/ai')
@Throttle({ default: { limit: 20, ttl: 60_000 } })
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('pricing-coach')
  pricingCoach(@Req() req: Authed, @Body() dto: PricingCoachDto) {
    return this.ai.pricingCoach(req.user.sub, dto);
  }

  @Post('brief-to-scope')
  briefToScope(@Req() req: Authed, @Body() dto: BriefToScopeDto) {
    return this.ai.briefToScope(req.user.sub, dto);
  }

  @Post('fairness-check')
  fairnessCheck(@Req() req: Authed, @Body() dto: FairnessCheckDto) {
    return this.ai.fairnessCheck(req.user.sub, dto);
  }

  @Post('weekly-digest')
  weeklyDigest(@Req() req: Authed) {
    return this.ai.weeklyDigest(req.user.sub);
  }

  @Post('invoice-chase-message')
  invoiceChaseMessage(@Req() req: Authed, @Body() dto: InvoiceChaseMessageDto) {
    return this.ai.invoiceChaseMessage(req.user.sub, dto);
  }

  @Post('brief-ambiguity')
  briefAmbiguity(@Req() req: Authed, @Body() dto: BriefAmbiguityDto) {
    return this.ai.briefAmbiguity(req.user.sub, dto);
  }

  @Post('scope-risk-line')
  scopeRiskLine(@Req() req: Authed, @Body() dto: ScopeRiskLineDto) {
    return this.ai.scopeRiskLine(req.user.sub, dto);
  }

  @Post('rewrite-scope')
  rewriteScope(@Req() req: Authed, @Body() dto: RewriteScopeDto) {
    return this.ai.rewriteScope(req.user.sub, dto);
  }
}
