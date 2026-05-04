import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ClientPortalService, ClientDashboard, ClientProject } from './client-portal.service';
import { ClientPortalGuard } from './client-portal.guard';
import { Request } from 'express';

interface AuthedRequest extends Request {
  clientContext: {
    clientId: string;
    freelancerId: string;
    permissions: string[];
  };
}

@ApiTags('Client Portal')
@Controller('portal')
export class ClientPortalController {
  constructor(private readonly clientPortalService: ClientPortalService) {}

  /** Public: short-lived signed token in query `t` (no Bearer). */
  @Get('invoice-pdf')
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  @ApiOperation({ summary: 'Download invoice PDF (temporary token in query t)' })
  @ApiResponse({ status: 200, description: 'PDF stream' })
  async downloadInvoicePdf(
    @Query('t') t: string,
    @Query('locale') locale?: string,
  ): Promise<StreamableFile> {
    if (!t?.trim()) {
      throw new BadRequestException('Missing query parameter t');
    }
    const buf = await this.clientPortalService.streamInvoicePdfFromDownloadToken(
      t.trim(),
      locale,
    );
    return new StreamableFile(buf, {
      type: 'application/pdf',
      disposition: 'attachment; filename="invoice.pdf"',
    });
  }

  @Get('access/:token')
  @ApiOperation({ summary: 'Access client portal via magic link' })
  @ApiResponse({ status: 200, description: 'Portal access granted' })
  @ApiResponse({ status: 401, description: 'Invalid or expired token' })
  async accessPortal(@Param('token') token: string) {
    try {
      const tokenData = await this.clientPortalService.validateMagicLink(token);
      const clientToken = await this.clientPortalService.generateClientToken(tokenData);
      
      return {
        success: true,
        clientToken,
        clientInfo: {
          clientId: tokenData.clientId,
          freelancerId: tokenData.freelancerId,
          permissions: tokenData.permissions,
          expiresAt: tokenData.expiresAt,
        },
      };
    } catch (error) {
      throw new HttpException('Invalid or expired portal link', HttpStatus.UNAUTHORIZED);
    }
  }

  @Get('dashboard')
  @UseGuards(ClientPortalGuard)
  @ApiOperation({ summary: 'Get client dashboard' })
  @ApiResponse({ status: 200, description: 'Dashboard data retrieved successfully' })
  async getDashboard(@Req() req: AuthedRequest): Promise<ClientDashboard> {
    const { clientId, freelancerId } = req.clientContext;
    return this.clientPortalService.getClientDashboard(clientId, freelancerId);
  }

  @Get('projects')
  @UseGuards(ClientPortalGuard)
  @ApiOperation({ summary: 'Get all client projects' })
  @ApiResponse({ status: 200, description: 'Projects retrieved successfully' })
  async getProjects(@Req() req: AuthedRequest): Promise<ClientProject[]> {
    const { clientId, freelancerId } = req.clientContext;
    return this.clientPortalService.getClientProjects(clientId, freelancerId);
  }

  @Get('projects/:projectId')
  @UseGuards(ClientPortalGuard)
  @ApiOperation({ summary: 'Get specific client project' })
  @ApiResponse({ status: 200, description: 'Project retrieved successfully' })
  async getProject(
    @Req() req: AuthedRequest,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<ClientProject> {
    const { clientId, freelancerId } = req.clientContext;
    return this.clientPortalService.getClientProject(clientId, freelancerId, projectId);
  }

  @Get('invoices')
  @UseGuards(ClientPortalGuard)
  @ApiOperation({ summary: 'Get client invoices' })
  @ApiResponse({ status: 200, description: 'Invoices retrieved successfully' })
  async getInvoices(@Req() req: AuthedRequest) {
    const { clientId, freelancerId } = req.clientContext;
    return this.clientPortalService.getClientInvoices(clientId, freelancerId);
  }

  @Post('invoices/:invoiceId/pdf-link')
  @UseGuards(ClientPortalGuard)
  @ApiOperation({ summary: 'Create temporary public URL to download invoice PDF' })
  @ApiResponse({ status: 200, description: '{ url, expiresAt }' })
  async createInvoicePdfLink(
    @Req() req: AuthedRequest,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
  ) {
    const { clientId, freelancerId } = req.clientContext;
    return this.clientPortalService.createInvoicePdfDownloadLink(
      clientId,
      freelancerId,
      invoiceId,
    );
  }

  @Put('deliveries/:deliveryId/feedback')
  @UseGuards(ClientPortalGuard)
  @ApiOperation({ summary: 'Update delivery feedback' })
  @ApiResponse({ status: 200, description: 'Feedback updated successfully' })
  async updateDeliveryFeedback(
    @Req() req: AuthedRequest,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
    @Body() body: {
      feedback: string;
      status: 'approved' | 'needs_changes';
    },
  ) {
    const { clientId, freelancerId } = req.clientContext;
    await this.clientPortalService.updateDeliveryFeedback(
      clientId,
      freelancerId,
      deliveryId,
      body.feedback,
      body.status,
    );
    
    return { success: true };
  }

  @Post('logout')
  @UseGuards(ClientPortalGuard)
  @ApiOperation({ summary: 'Logout from client portal' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  async logout(@Req() req: AuthedRequest) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      await this.clientPortalService.deactivatePortalToken(token);
    }
    
    return { success: true };
  }
}
