import { IsEmail, IsIn, IsOptional, IsString } from 'class-validator';

export class SendInvoiceEmailDto {
  @IsOptional()
  @IsEmail()
  to?: string;

  /** Email + PDF template locale (`en` | `es`). */
  @IsOptional()
  @IsString()
  @IsIn(['en', 'es'])
  locale?: 'en' | 'es';
}
