import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const INVOICE_STATUSES = ['draft', 'sent', 'viewed', 'paid'] as const;

export class CreateQuickInvoiceDto {
  @IsUUID()
  clientId!: string;

  /** When set, attach the invoice to this project instead of creating a new project. */
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title!: string;

  @IsInt()
  @Min(1)
  @Max(999_999_999_99)
  amountCents!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency!: string;

  @IsOptional()
  @IsIn(INVOICE_STATUSES)
  status?: (typeof INVOICE_STATUSES)[number];
}
