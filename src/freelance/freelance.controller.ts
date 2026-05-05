import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateClientDto } from './dto/create-client.dto';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { CreateProjectTaskDto } from './dto/create-project-task.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { CreateQuickInvoiceDto } from './dto/create-quick-invoice.dto';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { PatchClientDto } from './dto/patch-client.dto';
import { PatchInvoiceDto } from './dto/patch-invoice.dto';
import { PatchProjectDto } from './dto/patch-project.dto';
import { PatchProjectTaskDto } from './dto/patch-project-task.dto';
import { PatchQuoteDto } from './dto/patch-quote.dto';
import { SendInvoiceEmailDto } from './dto/send-invoice-email.dto';
import { FreelanceService } from './freelance.service';

type Authed = Request & { user: { sub: string } };

@Controller('v1/freelance')
@UseGuards(JwtAuthGuard)
export class FreelanceController {
  constructor(private readonly freelance: FreelanceService) {}

  @Get('summary')
  summary(@Req() req: Authed) {
    return this.freelance.summary(req.user.sub);
  }

  @Get('clients')
  listClients(@Req() req: Authed) {
    return this.freelance.listClients(req.user.sub);
  }

  @Post('clients')
  @Throttle({ default: { limit: 10, ttl: 3600_000 } })  // 10 per hour
  createClient(@Req() req: Authed, @Body() dto: CreateClientDto) {
    return this.freelance.createClient(req.user.sub, dto);
  }

  @Patch('clients/:id')
  patchClient(
    @Req() req: Authed,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PatchClientDto,
  ) {
    return this.freelance.patchClient(req.user.sub, id, dto);
  }

  @Delete('clients/:id')
  deleteClient(
    @Req() req: Authed,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.freelance.deleteClient(req.user.sub, id);
  }

  @Get('projects')
  listProjects(@Req() req: Authed) {
    return this.freelance.listProjects(req.user.sub);
  }

  @Post('projects')
  @Throttle({ default: { limit: 10, ttl: 3600_000 } })  // 10 per hour
  createProject(@Req() req: Authed, @Body() dto: CreateProjectDto) {
    return this.freelance.createProject(req.user.sub, dto);
  }

  @Get('projects/:id')
  getProject(
    @Req() req: Authed,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.freelance.getProject(req.user.sub, id);
  }

  @Patch('projects/:id')
  patchProject(
    @Req() req: Authed,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PatchProjectDto,
  ) {
    return this.freelance.patchProject(req.user.sub, id, dto);
  }

  @Delete('projects/:id')
  deleteProject(
    @Req() req: Authed,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.freelance.deleteProject(req.user.sub, id);
  }

  @Get('invoices')
  listInvoices(@Req() req: Authed) {
    return this.freelance.listInvoices(req.user.sub);
  }

  @Throttle({ default: { limit: 50, ttl: 3600_000 } })  // 50 per hour
  @Post('invoices/quick')
  createQuickInvoice(@Req() req: Authed, @Body() dto: CreateQuickInvoiceDto) {
    return this.freelance.createQuickInvoice(req.user.sub, dto);
  }

  @Patch('invoices/:id')
  patchInvoice(
    @Req() req: Authed,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PatchInvoiceDto,
  ) {
    return this.freelance.patchInvoice(req.user.sub, id, dto);
  }

  @Get('invoices/:id/pdf')
  async invoicePdf(
    @Req() req: Authed,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('locale') locale?: string,
  ): Promise<StreamableFile> {
    const buf = await this.freelance.invoicePdfBuffer(req.user.sub, id, locale);
    return new StreamableFile(buf, {
      type: 'application/pdf',
      disposition: `attachment; filename="invoice-${id.slice(0, 8)}.pdf"`,
    });
  }

  @Post('invoices/:id/send-email')
  sendInvoiceEmail(
    @Req() req: Authed,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendInvoiceEmailDto,
  ) {
    return this.freelance.sendInvoiceEmail(req.user.sub, id, dto);
  }

  @Get('invoices/:id/payments')
  listPayments(
    @Req() req: Authed,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.freelance.listPayments(req.user.sub, id);
  }

  @Post('invoices/:id/payments')
  @Throttle({ default: { limit: 50, ttl: 3600_000 } })  // 50 per hour
  recordPayment(
    @Req() req: Authed,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePaymentDto,
    @Headers('idempotency-key') idempotencyKeyHeader?: string,
  ) {
    return this.freelance.recordPayment(req.user.sub, id, dto, idempotencyKeyHeader);
  }

  @Get('quotes')
  listQuotes(@Req() req: Authed) {
    return this.freelance.listQuotes(req.user.sub);
  }

  @Post('quotes')
  @Throttle({ default: { limit: 20, ttl: 3600_000 } })  // 20 per hour
  createQuote(@Req() req: Authed, @Body() dto: CreateQuoteDto) {
    return this.freelance.createQuote(req.user.sub, dto);
  }

  @Patch('quotes/:id')
  patchQuote(
    @Req() req: Authed,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PatchQuoteDto,
  ) {
    return this.freelance.patchQuote(req.user.sub, id, dto);
  }

  @Post('quotes/:id/convert')
  convertQuote(
    @Req() req: Authed,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.freelance.convertQuoteToInvoice(req.user.sub, id);
  }

  @Get('quotes/:id/pdf')
  async quotePdf(
    @Req() req: Authed,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('locale') locale?: string,
  ): Promise<StreamableFile> {
    const buf = await this.freelance.quotePdfBuffer(req.user.sub, id, locale);
    return new StreamableFile(buf, {
      type: 'application/pdf',
      disposition: `attachment; filename="quote-${id.slice(0, 8)}.pdf"`,
    });
  }

  @Get('projects/:id/deliveries')
  listDeliveries(
    @Req() req: Authed,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.freelance.listDeliveries(req.user.sub, id);
  }

  @Post('projects/:id/deliveries')
  createDelivery(
    @Req() req: Authed,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateDeliveryDto,
  ) {
    return this.freelance.createDelivery(req.user.sub, id, dto);
  }

  @Post('projects/:id/tasks')
  createProjectTask(
    @Req() req: Authed,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateProjectTaskDto,
  ) {
    return this.freelance.createProjectTask(req.user.sub, id, dto);
  }

  @Patch('projects/:id/tasks/:taskId')
  patchProjectTask(
    @Req() req: Authed,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: PatchProjectTaskDto,
  ) {
    return this.freelance.patchProjectTask(req.user.sub, id, taskId, dto);
  }

  @Delete('projects/:id/tasks/:taskId')
  deleteProjectTask(
    @Req() req: Authed,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ) {
    return this.freelance.deleteProjectTask(req.user.sub, id, taskId);
  }

  // Finance endpoints
  @Get('finance/overview')
  financeOverview(@Req() req: Authed) {
    return this.freelance.financeOverview(req.user.sub);
  }

  @Get('finance/expenses')
  financeExpenses(@Req() req: Authed) {
    return this.freelance.listBudgetExpenses(req.user.sub);
  }

  @Post('finance/expenses')
  createExpense(@Req() req: Authed, @Body() dto: any) {
    return this.freelance.createBudgetExpense(req.user.sub, dto);
  }

  @Patch('finance/expenses/:id')
  patchExpense(
    @Req() req: Authed,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: any,
  ) {
    return this.freelance.patchBudgetExpense(req.user.sub, id, dto);
  }

  @Delete('finance/expenses/:id')
  deleteExpense(
    @Req() req: Authed,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.freelance.deleteBudgetExpense(req.user.sub, id);
  }

  // Scope templates endpoints (placeholders - feature not yet implemented)
  @Get('scope-templates')
  listScopeTemplates(@Req() req: Authed) {
    return { templates: [] };
  }

  @Post('scope-templates')
  createScopeTemplate(@Req() req: Authed, @Body() dto: any) {
    return { id: 'temp-id', ...dto };
  }
}
