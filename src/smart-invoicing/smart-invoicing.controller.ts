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
import { SmartInvoicingService } from './smart-invoicing.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Request } from 'express';
import {
  CreateUserPaymentMethodDto,
  UpdateUserPaymentMethodDto,
} from './dto/payment-method.dto';
import type { UserPaymentMethodResponse } from './payment-models';

type Authed = Request & { user: { sub: string } };

@Controller('v1/smart-invoicing')
@UseGuards(JwtAuthGuard)
export class SmartInvoicingController {
  constructor(private readonly smartInvoicing: SmartInvoicingService) {}

  @Get('invoice/:invoiceId')
  getSmartInvoice(@Req() req: Authed, @Param('invoiceId') invoiceId: string) {
    return this.smartInvoicing.getSmartInvoice(req.user.sub, invoiceId);
  }

  @Get('payment-methods')
  listPaymentMethods(@Req() req: Authed): Promise<UserPaymentMethodResponse[]> {
    return this.smartInvoicing.listPaymentMethods(req.user.sub);
  }

  @Post('payment-methods')
  createPaymentMethod(
    @Req() req: Authed,
    @Body() dto: CreateUserPaymentMethodDto,
  ): Promise<UserPaymentMethodResponse> {
    return this.smartInvoicing.createPaymentMethod(req.user.sub, dto);
  }

  @Put('payment-methods/:methodId')
  updatePaymentMethod(
    @Req() req: Authed,
    @Param('methodId') methodId: string,
    @Body() dto: UpdateUserPaymentMethodDto,
  ): Promise<UserPaymentMethodResponse> {
    return this.smartInvoicing.updatePaymentMethod(req.user.sub, methodId, dto);
  }

  @Delete('payment-methods/:methodId')
  removePaymentMethod(@Req() req: Authed, @Param('methodId') methodId: string) {
    return this.smartInvoicing.removePaymentMethod(req.user.sub, methodId);
  }

  @Get('qr-code/:invoiceId')
  getQRCode(
    @Req() req: Authed,
    @Param('invoiceId') invoiceId: string,
  ) {
    return { qrCode: 'https://app.rizzup.com/pay/' + invoiceId };
  }

  @Get('pdf/:invoiceId')
  async getInvoicePdf(@Req() req: Authed, @Param('invoiceId') invoiceId: string) {
    const buffer = await this.smartInvoicing.generatePdf(invoiceId, req.user.sub);
    return {
      base64: buffer.toString('base64'),
      contentType: 'application/pdf',
      filename: `invoice-${invoiceId}.pdf`,
    };
  }

  @Get('payment-links/:invoiceId')
  getPaymentLinks(@Req() req: Authed, @Param('invoiceId') invoiceId: string) {
    return this.smartInvoicing.generatePaymentLinks(req.user.sub, invoiceId);
  }

  @Get('reminders/:invoiceId')
  getSmartReminders(
    @Req() req: Authed,
    @Param('invoiceId') invoiceId: string,
  ) {
    return this.smartInvoicing.createSmartReminders(invoiceId);
  }

  @Get('pending-reminders')
  getPendingReminders() {
    return this.smartInvoicing.getPendingReminders();
  }

  @Post('send-reminder/:invoiceId/:reminderId')
  sendSmartReminder(
    @Req() req: Authed,
    @Param('invoiceId') invoiceId: string,
    @Param('reminderId') reminderId: string,
  ) {
    return this.smartInvoicing.sendSmartReminder(invoiceId, reminderId);
  }
}
