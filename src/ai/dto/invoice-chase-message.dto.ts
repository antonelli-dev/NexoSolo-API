import { IsIn, IsUUID } from 'class-validator';

export class InvoiceChaseMessageDto {
  @IsUUID()
  invoiceId!: string;

  @IsIn(['firm', 'friendly'])
  tone!: 'firm' | 'friendly';
}
