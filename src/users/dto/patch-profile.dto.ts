import { IsOptional, IsString, IsUrl, Matches, MaxLength } from 'class-validator';

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
}
