import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
  Param,
  ParseUUIDPipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { MarketplaceService } from './marketplace.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Request } from 'express';

type Authed = Request & { user: { sub: string } };

@Controller('v1/marketplace')
@UseGuards(JwtAuthGuard)
export class MarketplaceController {
  constructor(private readonly marketplace: MarketplaceService) {}

  @Get('templates')
  async getTemplates(
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Query('isPremium') isPremium?: string,
  ) {
    const premium = isPremium === 'true' ? true : isPremium === 'false' ? false : undefined;
    return this.marketplace.getTemplates(category, search, premium);
  }

  @Get('templates/free')
  async getFreeTemplates() {
    return this.marketplace.getFreeTemplates();
  }

  @Get('templates/premium')
  async getPremiumTemplates() {
    return this.marketplace.getPremiumTemplates();
  }

  @Get('templates/popular')
  async getPopularTemplates(@Query('limit', new ParseIntPipe({ optional: true })) limit?: number) {
    return this.marketplace.getPopularTemplates(limit || 5);
  }

  @Get('templates/my')
  async getUserTemplates(@Req() req: Authed) {
    return this.marketplace.getUserTemplates(req.user.sub);
  }

  @Get('templates/creator/:creatorId')
  async getCreatorTemplates(@Param('creatorId', ParseUUIDPipe) creatorId: string) {
    return this.marketplace.getCreatorTemplates(creatorId);
  }

  @Post('templates/:templateId/purchase')
  async purchaseTemplate(
    @Param('templateId') templateId: string,
    @Req() req: Authed,
  ) {
    return this.marketplace.purchaseTemplate(templateId, req.user.sub);
  }

  @Get('stats')
  async getTemplateStats(@Req() req: Authed) {
    return this.marketplace.getTemplateStats(req.user.sub);
  }
}
