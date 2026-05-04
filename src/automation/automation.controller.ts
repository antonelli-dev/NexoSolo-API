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
  Query,
} from '@nestjs/common';
import { AutomationService } from './automation.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Request } from 'express';

type Authed = Request & { user: { sub: string } };

@Controller('v1/automation')
@UseGuards(JwtAuthGuard)
export class AutomationController {
  constructor(private readonly automation: AutomationService) {}

  @Get('reminder-rules')
  async getReminderRules(@Req() req: Authed) {
    return this.automation.getReminderRules(req.user.sub);
  }

  @Post('reminder-rules')
  async createReminderRule(
    @Req() req: Authed,
    @Body() rule: Omit<any, 'id' | 'userId'>,
  ) {
    return this.automation.createReminderRule(req.user.sub, rule);
  }

  @Put('reminder-rules/:ruleId')
  async updateReminderRule(
    @Req() req: Authed,
    @Param('ruleId') ruleId: string,
    @Body() updates: Partial<any>,
  ) {
    return this.automation.updateReminderRule(ruleId, req.user.sub, updates);
  }

  @Post('reminder-rules/:ruleId/toggle')
  async toggleReminderRule(
    @Req() req: Authed,
    @Param('ruleId') ruleId: string,
  ) {
    return this.automation.toggleReminderRule(ruleId, req.user.sub);
  }

  @Delete('reminder-rules/:ruleId')
  async deleteReminderRule(
    @Req() req: Authed,
    @Param('ruleId') ruleId: string,
  ) {
    return this.automation.deleteReminderRule(ruleId, req.user.sub);
  }

  @Get('reminders/generate')
  async generateReminders(@Req() req: Authed) {
    return this.automation.generateReminders(req.user.sub);
  }

  @Post('reminders/:reminderId/send')
  async sendReminder(
    @Req() req: Authed,
    @Param('reminderId') reminderId: string,
  ) {
    return this.automation.sendReminder(reminderId);
  }

  @Get('reminders/pending')
  async getPendingReminders(@Req() req: Authed) {
    return this.automation.getPendingReminders(req.user.sub);
  }

  @Get('stats')
  async getReminderStats(@Req() req: Authed) {
    return this.automation.getReminderStats(req.user.sub);
  }

  @Get('templates')
  async getReminderTemplates() {
    return this.automation.getReminderTemplates();
  }
}
