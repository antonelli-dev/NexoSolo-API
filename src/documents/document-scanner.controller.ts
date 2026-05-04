import {
  Controller,
  Get,
  Post,
  Delete,
  UploadedFile,
  UseInterceptors,
  Body,
  Req,
  UseGuards,
  Param,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentScannerService } from './document-scanner.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Request } from 'express';

type Authed = Request & { user: { sub: string } };

@Controller('v1/documents')
@UseGuards(JwtAuthGuard)
export class DocumentScannerController {
  constructor(private readonly documentScanner: DocumentScannerService) {}

  @Post('scan')
  @UseInterceptors(FileInterceptor('file'))
  async scanDocument(
    @Req() req: Authed,
    @UploadedFile() file: any,
    @Body('type') documentType: 'receipt' | 'invoice' | 'contract' | 'business_card',
  ) {
    if (!file) {
      throw new Error('No file uploaded');
    }

    return this.documentScanner.scanDocument(req.user.sub, file.buffer, documentType);
  }

  @Get()
  async getUserDocuments(
    @Req() req: Authed,
    @Query('type') type?: 'receipt' | 'invoice' | 'contract' | 'business_card',
  ) {
    return this.documentScanner.getUserDocuments(req.user.sub, type);
  }

  @Post(':documentId/create-expense')
  async createExpenseFromReceipt(
    @Req() req: Authed,
    @Param('documentId') documentId: string,
  ) {
    return this.documentScanner.createExpenseFromReceipt(documentId, req.user.sub);
  }

  @Post(':documentId/create-invoice')
  async createInvoiceFromDocument(
    @Req() req: Authed,
    @Param('documentId') documentId: string,
  ) {
    return this.documentScanner.createInvoiceFromDocument(documentId, req.user.sub);
  }

  @Post(':documentId/create-client')
  async createClientFromBusinessCard(
    @Req() req: Authed,
    @Param('documentId') documentId: string,
  ) {
    return this.documentScanner.createClientFromBusinessCard(documentId, req.user.sub);
  }

  @Post(':documentId/extract-contract')
  async extractContractData(
    @Req() req: Authed,
    @Param('documentId') documentId: string,
  ) {
    return this.documentScanner.extractContractData(documentId, req.user.sub);
  }

  @Delete(':documentId')
  async deleteDocument(
    @Req() req: Authed,
    @Param('documentId') documentId: string,
  ) {
    return this.documentScanner.deleteDocument(documentId, req.user.sub);
  }

  @Get('stats')
  async getDocumentStats(@Req() req: Authed) {
    return this.documentScanner.getDocumentStats(req.user.sub);
  }
}
