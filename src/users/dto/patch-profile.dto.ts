import {
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';

export class PatchProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  invoiceBrandName?: string;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  invoiceBrandLogoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  invoiceBrandAddress?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  invoiceBrandAccentHex?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  invoiceBrandFooter?: string;

  /** Issuer VAT / tax id; user is responsible for accuracy. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  invoiceIssuerTaxId?: string;

  /** Invoice PDF block visibility + custom labels (JSON object). */
  @IsOptional()
  @IsObject()
  invoiceDocumentTemplate?: Record<string, unknown>;

  /** Numbering: mode, prefix, suffix, padLength, nextSequence, etc. (JSON object). */
  @IsOptional()
  @IsObject()
  invoiceNumbering?: Record<string, unknown>;
}
