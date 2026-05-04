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
import { SmartInvoicingService } from './smart-invoicing.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Request } from 'express';

type Authed = Request & { user: { sub: string } };

@Controller('v1/smart-invoicing')
@UseGuards(JwtAuthGuard)
export class SmartInvoicingController {
  constructor(private readonly smartInvoicing: SmartInvoicingService) {}

  @Get('invoice/:invoiceId')
  async getSmartInvoice(
    @Req() req: Authed,
    @Param('invoiceId') invoiceId: string,
  ) {
    return this.smartInvoicing.getSmartInvoice(req.user.sub, invoiceId);
  }

  @Get('payment-methods')
  async getPaymentMethods(@Req() req: Authed) {
    return this.smartInvoicing.getUserPaymentMethods(req.user.sub);
  }

  @Post('payment-methods')
  async addPaymentMethod(
    @Req() req: Authed,
    @Body() method: {
      type: 'stripe' | 'paypal' | 'wise' | 'bank' | 'crypto';
      name: string;
      isActive: boolean;
      accountDetails?: Record<string, any>;
      fees: {
        percentage: number;
        fixed: number;
        currency: string;
      };
      processingTime: string;
    },
  ) {
    return this.smartInvoicing.addPaymentMethod(req.user.sub, method);
  }

  @Put('payment-methods/:methodId')
  async updatePaymentMethod(
    @Req() req: Authed,
    @Param('methodId') methodId: string,
    @Body() updates: Partial<{
      type: 'stripe' | 'paypal' | 'wise' | 'bank' | 'crypto';
      name: string;
      isActive: boolean;
      accountDetails?: Record<string, any>;
      fees: {
        percentage: number;
        fixed: number;
        currency: string;
      };
      processingTime: string;
    }>,
  ) {
    return this.smartInvoicing.updatePaymentMethod(req.user.sub, methodId, updates);
  }

  @Delete('payment-methods/:methodId')
  async deletePaymentMethod(
    @Req() req: Authed,
    @Param('methodId') methodId: string,
  ) {
    return this.smartInvoicing.deletePaymentMethod(req.user.sub, methodId);
  }

  @Get('qr-code/:invoiceId')
  async getQRCode(
    @Req() req: Authed,
    @Param('invoiceId') invoiceId: string,
  ) {
    return { qrCode: await this.smartInvoicing.generateQRCode(invoiceId) };
  }

  @Get('payment-links/:invoiceId')
  async getPaymentLinks(
    @Req() req: Authed,
    @Param('invoiceId') invoiceId: string,
  ) {
    return this.smartInvoicing.generatePaymentLinks(req.user.sub, invoiceId);
  }

  @Get('reminders/:invoiceId')
  async getSmartReminders(
    @Req() req: Authed,
    @Param('invoiceId') invoiceId: string,
  ) {
    return this.smartInvoicing.createSmartReminders(invoiceId);
  }

  @Get('pending-reminders')
  async getPendingReminders() {
    return this.smartInvoicing.getPendingReminders();
  }

  @Post('send-reminder/:invoiceId/:reminderId')
  async sendSmartReminder(
    @Req() req: Authed,
    @Param('invoiceId') invoiceId: string,
    @Param('reminderId') reminderId: string,
  ) {
    return this.smartInvoicing.sendSmartReminder(invoiceId, reminderId);
  }
}
