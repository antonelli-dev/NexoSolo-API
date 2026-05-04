import { IsDateString, IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

const INVOICE_STATUSES = ['draft', 'sent', 'viewed', 'paid'] as const;

export class PatchInvoiceDto {
  @IsOptional()
  @IsIn(INVOICE_STATUSES)
  status?: (typeof INVOICE_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  memo?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  invoiceNumber?: string | null;

  @IsOptional()
  @IsObject()
  lineItems?: Record<string, unknown> | null;
}
