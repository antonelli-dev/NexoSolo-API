import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Req,
  UseGuards,
  Param,
  Query,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Request } from 'express';

type Authed = Request & { user: { sub: string } };

@Controller('v1/notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post('send')
  async sendNotification(
    @Req() req: Authed,
    @Body() notification: {
      type: string;
      data: Record<string, any>;
      channels?: ('email' | 'push')[];
    },
  ) {
    return this.notifications.sendNotification({
      type: notification.type as any,
      userId: req.user.sub,
      data: notification.data,
      channels: notification.channels,
    });
  }

  @Get('preferences')
  async getPreferences(@Req() req: Authed) {
    return this.notifications.getUserPreferences(req.user.sub);
  }

  @Put('preferences')
  async updatePreferences(
    @Req() req: Authed,
    @Body() preferences: {
      email?: {
        invoiceEvents?: boolean;
        paymentEvents?: boolean;
        streakEvents?: boolean;
        weeklyDigest?: boolean;
        marketingEmails?: boolean;
      };
      push?: {
        invoiceEvents?: boolean;
        paymentEvents?: boolean;
        streakEvents?: boolean;
        reminders?: boolean;
      };
    },
  ) {
    return this.notifications.updatePreferences(req.user.sub, preferences as any);
  }

  @Get('history')
  async getNotificationHistory(
    @Req() req: Authed,
    @Query('limit') limit?: number,
  ) {
    return this.notifications.getNotificationHistory(req.user.sub, limit);
  }

  @Put('read/:notificationId')
  async markAsRead(
    @Req() req: Authed,
    @Param('notificationId') notificationId: string,
  ) {
    return this.notifications.markAsRead(req.user.sub, notificationId);
  }

  @Put('read-all')
  async markAllAsRead(@Req() req: Authed) {
    return this.notifications.markAllAsRead(req.user.sub);
  }
}
