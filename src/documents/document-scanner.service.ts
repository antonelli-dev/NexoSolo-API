import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from '../common/logger.service';

export interface ScannedDocument {
  id: string;
  userId: string;
  type: 'receipt' | 'invoice' | 'contract' | 'business_card';
  originalImage: string;
  extractedText: string;
  processedData: {
    amount?: number;
    currency?: string;
    date?: Date;
    vendor?: string;
    category?: string;
    invoiceNumber?: string;
    items?: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
    }>;
    contactInfo?: {
      name: string;
      email?: string;
      phone?: string;
      company?: string;
      address?: string;
    };
    contractDetails?: {
      parties: string[];
      startDate?: Date;
      endDate?: Date;
      amount?: number;
      terms?: string[];
    };
  };
  confidence: number;
  status: 'processing' | 'completed' | 'error';
  createdAt: Date;
  updatedAt: Date;
}

export interface OCRResult {
  text: string;
  confidence: number;
  blocks: Array<{
    text: string;
    boundingBox: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    confidence: number;
  }>;
}

@Injectable()
export class DocumentScannerService {
  private readonly logger: AppLogger;

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {
    this.logger = new AppLogger(config);
  }

  async scanDocument(
    userId: string,
    imageBuffer: Buffer,
    documentType: ScannedDocument['type']
  ): Promise<ScannedDocument> {
    // Perform OCR (simplified for demo - would integrate with Google Vision API)
    const ocrResult = await this.performOCR(imageBuffer);
    
    // Process extracted text based on document type
    const processedData = await this.processDocumentData(ocrResult, documentType);
    
    // Create scanned document record
    const scannedDocument: ScannedDocument = {
      id: `doc_${Date.now()}`,
      userId,
      type: documentType,
      originalImage: imageBuffer.toString('base64'),
      extractedText: ocrResult.text,
      processedData,
      confidence: ocrResult.confidence,
      status: 'completed',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // TODO: Save to database
    // TODO: Store image in cloud storage
    return scannedDocument;
  }

  async getUserDocuments(userId: string, type?: ScannedDocument['type']): Promise<ScannedDocument[]> {
    // TODO: Get from database
    const mockDocuments: ScannedDocument[] = [
      {
        id: '1',
        userId,
        type: 'receipt',
        originalImage: 'base64_data',
        extractedText: 'RESTAURANTE EL BUEN SABOR\nTotal: $45.50\nFecha: 15/02/2024',
        processedData: {
          amount: 45.50,
          currency: 'USD',
          date: new Date('2024-02-15'),
          vendor: 'RESTAURANTE EL BUEN SABOR',
          category: 'food',
        },
        confidence: 0.92,
        status: 'completed',
        createdAt: new Date('2024-02-15'),
        updatedAt: new Date('2024-02-15'),
      },
      {
        id: '2',
        userId,
        type: 'invoice',
        originalImage: 'base64_data',
        extractedText: 'INV-2024-001\nWeb Development Services\nAmount: $2,500.00\nDue: 2024-03-01',
        processedData: {
          amount: 2500.00,
          currency: 'USD',
          date: new Date('2024-02-01'),
          vendor: 'Client Company',
          category: 'services',
          invoiceNumber: 'INV-2024-001',
        },
        confidence: 0.95,
        status: 'completed',
        createdAt: new Date('2024-02-01'),
        updatedAt: new Date('2024-02-01'),
      },
      {
        id: '3',
        userId,
        type: 'business_card',
        originalImage: 'base64_data',
        extractedText: 'Juan Developer\nFull Stack Developer\njuan@dev.com\n+1 234 567 890\nTech Solutions Inc.',
        processedData: {
          contactInfo: {
            name: 'Juan Developer',
            email: 'juan@dev.com',
            phone: '+1 234 567 890',
            company: 'Tech Solutions Inc.',
          },
        },
        confidence: 0.88,
        status: 'completed',
        createdAt: new Date('2024-02-10'),
        updatedAt: new Date('2024-02-10'),
      },
    ];

    if (type) {
      return mockDocuments.filter(doc => doc.type === type);
    }
    return mockDocuments;
  }

  async createExpenseFromReceipt(documentId: string, userId: string): Promise<void> {
    const document = await this.getDocument(documentId, userId);
    
    if (document.type !== 'receipt' || !document.processedData.amount) {
      throw new Error('Document must be a receipt with valid amount');
    }

    // TODO: Create expense automatically in freelance module
    // TODO: Categorize expense based on vendor
    // TODO: Attach receipt image to expense
    this.logger.logBusinessEvent('expense_created_from_document', userId, {
      documentId,
      amount: document.processedData.amount,
      vendor: document.processedData.vendor,
    });
  }

  async createInvoiceFromDocument(documentId: string, userId: string): Promise<void> {
    const document = await this.getDocument(documentId, userId);
    
    if (document.type !== 'invoice' || !document.processedData.amount) {
      throw new Error('Document must be an invoice with valid amount');
    }

    // TODO: Create invoice automatically in freelance module
    // TODO: Extract client information
    // TODO: Set due date based on document
    this.logger.logBusinessEvent('invoice_created_from_document', userId, {
      documentId,
      invoiceNumber: document.processedData.invoiceNumber,
      amount: document.processedData.amount,
    });
  }

  async createClientFromBusinessCard(documentId: string, userId: string): Promise<void> {
    const document = await this.getDocument(documentId, userId);
    
    if (document.type !== 'business_card' || !document.processedData.contactInfo) {
      throw new Error('Document must be a business card with valid contact info');
    }

    // TODO: Create client automatically in freelance module
    // TODO: Extract contact information
    // TODO: Save to clients database
    const contact = document.processedData.contactInfo;
    this.logger.logBusinessEvent('client_created_from_business_card', userId, {
      documentId,
      clientName: contact.name,
      clientEmail: contact.email,
      clientPhone: contact.phone,
    });
  }

  async extractContractData(documentId: string, userId: string): Promise<void> {
    const document = await this.getDocument(documentId, userId);
    
    if (document.type !== 'contract') {
      throw new Error('Document must be a contract');
    }

    // TODO: Extract contract terms
    // TODO: Identify important dates
    // TODO: Extract amounts and parties
    this.logger.logBusinessEvent('contract_data_extraction_started', userId, {
      documentId,
    });
  }

  private async performOCR(imageBuffer: Buffer): Promise<OCRResult> {
    // TODO: Integrate with Google Vision API, AWS Textract, or similar
    // For demo, return mock OCR result
    
    return {
      text: this.generateMockOCRText(imageBuffer),
      confidence: 0.92,
      blocks: [
        {
          text: 'RESTAURANTE EL BUEN SABOR',
          boundingBox: { x: 10, y: 10, width: 200, height: 30 },
          confidence: 0.95,
        },
        {
          text: 'TOTAL $37.80',
          boundingBox: { x: 150, y: 200, width: 100, height: 25 },
          confidence: 0.98,
        },
      ],
    };
  }

  private generateMockOCRText(imageBuffer: Buffer): string {
    // Generate different mock text based on buffer size (simulating different documents)
    const size = imageBuffer.length;
    
    if (size < 10000) {
      // Small image - business card
      return 'Juan Developer\nFull Stack Developer\njuan@dev.com\n+1 234 567 890\nTech Solutions Inc.\n123 Tech Street\nSan Francisco, CA 94105';
    } else if (size < 50000) {
      // Medium image - receipt
      return 'RESTAURANTE EL BUEN SABOR\nAv. Principal #123\nTel: 555-1234\n\nHAMBURGUESA $15.00\nPAPAS FRITAS $8.00\nREFRESCO $5.00\nIVA 16% $4.80\nPROPINA $5.00\nTOTAL $37.80\n\nFecha: 15/02/2024\nHora: 14:30';
    } else {
      // Large image - invoice
      return 'INV-2024-001\nWeb Development Services\nClient: Tech Solutions Inc.\nAddress: 123 Tech Street, San Francisco, CA 94105\n\nDescription: Website redesign and development\n\nHours: 40 hours\nRate: $62.50/hour\n\nSubtotal: $2,500.00\nTax (8%): $200.00\nTOTAL: $2,700.00\n\nDue Date: March 1, 2024\nPayment Terms: Net 30';
    }
  }

  private async processDocumentData(
    ocrResult: OCRResult,
    documentType: ScannedDocument['type']
  ): Promise<ScannedDocument['processedData']> {
    const text = ocrResult.text;
    
    switch (documentType) {
      case 'receipt':
        return this.processReceipt(text);
      case 'invoice':
        return this.processInvoice(text);
      case 'contract':
        return this.processContract(text);
      case 'business_card':
        return this.processBusinessCard(text);
      default:
        return {};
    }
  }

  private processReceipt(text: string): ScannedDocument['processedData'] {
    // Extract total amount
    const amountMatch = text.match(/TOTAL\s*\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/);
    const amount = amountMatch ? parseFloat(amountMatch[1].replace(',', '')) : undefined;
    
    // Extract date
    const dateMatch = text.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/);
    const date = dateMatch ? new Date(dateMatch[1]) : undefined;
    
    // Extract vendor (usually first line)
    const lines = text.split('\n');
    const vendor = lines[0]?.trim() || undefined;
    
    // Categorize based on vendor name
    let category = 'other';
    if (vendor) {
      const vendorLower = vendor.toLowerCase();
      if (vendorLower.includes('restauran') || vendorLower.includes('food') || vendorLower.includes('café')) {
        category = 'food';
      } else if (vendorLower.includes('gas') || vendorLower.includes('shell') || vendorLower.includes('bp')) {
        category = 'transport';
      } else if (vendorLower.includes('amazon') || vendorLower.includes('walmart') || vendorLower.includes('target')) {
        category = 'shopping';
      } else if (vendorLower.includes('hotel') || vendorLower.includes('airbnb') || vendorLower.includes('booking')) {
        category = 'travel';
      }
    }

    return {
      amount,
      currency: 'USD',
      date,
      vendor,
      category,
    };
  }

  private processInvoice(text: string): ScannedDocument['processedData'] {
    // Extract invoice number
    const invoiceMatch = text.match(/INV[-\s]?(\d{4}[-\s]?\d{3})/i);
    const invoiceNumber = invoiceMatch ? invoiceMatch[1] : undefined;
    
    // Extract total amount
    const amountMatch = text.match(/TOTAL[:\s]*\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/i);
    const amount = amountMatch ? parseFloat(amountMatch[1].replace(',', '')) : undefined;
    
    // Extract due date
    const dueDateMatch = text.match(/DUE\s+DATE[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i);
    const date = dueDateMatch ? new Date(dueDateMatch[1]) : undefined;
    
    // Extract client/vendor (usually after "Client:" or similar)
    const clientMatch = text.match(/CLIENT[:\s]+([^\n]+)/i);
    const vendor = clientMatch ? clientMatch[1].trim() : undefined;
    
    return {
      amount,
      currency: 'USD',
      date,
      vendor,
      invoiceNumber,
      category: 'services',
    };
  }

  private processContract(text: string): ScannedDocument['processedData'] {
    // Extract dates
    const startDateMatch = text.match(/START\s+DATE[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i);
    const endDateMatch = text.match(/END\s+DATE[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i);
    
    // Extract amount
    const amountMatch = text.match(/AMOUNT[:\s]*\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/i);
    
    // Extract parties (simplified)
    const lines = text.split('\n');
    const parties = lines.filter(line => 
      line.includes('PARTY') || 
      line.includes('CLIENT') || 
      line.includes('CONTRACTOR') ||
      line.includes('PROVIDER')
    ).slice(0, 2);

    return {
      contractDetails: {
        parties,
        startDate: startDateMatch ? new Date(startDateMatch[1]) : undefined,
        endDate: endDateMatch ? new Date(endDateMatch[1]) : undefined,
        amount: amountMatch ? parseFloat(amountMatch[1].replace(',', '')) : undefined,
        terms: [],
      },
    };
  }

  private processBusinessCard(text: string): ScannedDocument['processedData'] {
    // Extract email
    const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    
    // Extract phone
    const phoneMatch = text.match(/(\+?\d[\d\s\-\(\)]{7,})/);
    
    // Extract name (usually first line)
    const lines = text.split('\n').filter(line => line.trim());
    const name = lines[0]?.trim() || undefined;
    
    // Extract company (usually in lines 2-4)
    let company = undefined;
    for (let i = 1; i < Math.min(lines.length, 4); i++) {
      const line = lines[i].trim();
      if (line && !emailMatch?.[1].includes(line) && !phoneMatch?.[1].includes(line)) {
        company = line;
        break;
      }
    }

    // Extract address (if contains street-like words)
    let address = undefined;
    for (const line of lines) {
      if (line.toLowerCase().includes('street') || 
          line.toLowerCase().includes('ave') || 
          line.toLowerCase().includes('st.') ||
          line.toLowerCase().includes('suite') ||
          /\d+\s+\w+\s+(street|st|ave|avenue|road|rd|drive|dr)/i.test(line)) {
        address = line.trim();
        break;
      }
    }

    return {
      contactInfo: {
        name: name || '',
        email: emailMatch ? emailMatch[1] : undefined,
        phone: phoneMatch ? phoneMatch[1] : undefined,
        company,
        address,
      },
    };
  }

  private async getDocument(documentId: string, userId: string): Promise<ScannedDocument> {
    // TODO: Get from database
    const mockDocument: ScannedDocument = {
      id: documentId,
      userId,
      type: 'receipt',
      originalImage: 'base64_data',
      extractedText: 'Sample text',
      processedData: {},
      confidence: 0.9,
      status: 'completed',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return mockDocument;
  }

  async deleteDocument(documentId: string, userId: string): Promise<void> {
    // TODO: Delete from database
    // TODO: Delete image from cloud storage
    this.logger.logBusinessEvent('document_deleted', userId, {
      documentId,
    });
  }

  async getDocumentStats(userId: string): Promise<{
    totalDocuments: number;
    documentsByType: Record<string, number>;
    averageConfidence: number;
    totalExpensesExtracted: number;
  }> {
    // TODO: Calculate from database
    return {
      totalDocuments: 15,
      documentsByType: {
        receipt: 8,
        invoice: 4,
        business_card: 2,
        contract: 1,
      },
      averageConfidence: 0.91,
      totalExpensesExtracted: 8,
    };
  }
}
