import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const PAYMENT_METHOD_TYPES = ['stripe', 'paypal', 'wise', 'bank', 'crypto'] as const;

export class PaymentFeesDto {
  @IsNumber()
  @Min(0)
  percentage!: number;

  @IsInt()
  @Min(0)
  fixed!: number;

  @IsString()
  @MaxLength(3)
  currency!: string;
}

/** Optional provider fields; empty strings on update keep existing secrets (see merge). */
export class PaymentAccountDetailsDto {
  @IsOptional()
  @IsString()
  stripeSecretKey?: string;

  @IsOptional()
  @IsString()
  stripePublishableKey?: string;

  @IsOptional()
  @IsString()
  paypalEmail?: string;

  @IsOptional()
  @IsString()
  paypalClientSecret?: string;

  @IsOptional()
  @IsString()
  wiseProfileId?: string;

  @IsOptional()
  @IsString()
  wiseApiKey?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  bankAccountLast4?: string;

  @IsOptional()
  @IsString()
  bankRoutingHint?: string;

  @IsOptional()
  @IsString()
  cryptoCheckoutHint?: string;

  @IsOptional()
  @IsString()
  cryptoApiKey?: string;

  /** HTTPS link shown to payers (any provider); overrides generic stubs when set. */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  externalPayUrl?: string;

  /** PayPal.Me handle (no @); builds https://paypal.me/{handle} */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  paypalMeHandle?: string;
}

export class CreateUserPaymentMethodDto {
  @IsString()
  @IsIn(PAYMENT_METHOD_TYPES)
  type!: (typeof PAYMENT_METHOD_TYPES)[number];

  @IsString()
  @MaxLength(160)
  name!: string;

  @IsBoolean()
  isActive!: boolean;

  @IsString()
  @MaxLength(32)
  processingTime!: string;

  @ValidateNested()
  @Type(() => PaymentFeesDto)
  fees!: PaymentFeesDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentAccountDetailsDto)
  accountDetails?: PaymentAccountDetailsDto;
}

export class UpdateUserPaymentMethodDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  processingTime?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentFeesDto)
  fees?: PaymentFeesDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentAccountDetailsDto)
  accountDetails?: PaymentAccountDetailsDto;
}

export function accountDetailsToRecord(
  dto: PaymentAccountDetailsDto | undefined,
): Record<string, string> | undefined {
  if (!dto) {
    return undefined;
  }
  const out: Record<string, string> = {};
  const entries = Object.entries(dto) as Array<[string, string | undefined]>;
  for (const [k, v] of entries) {
    if (typeof v === 'string' && v.length > 0) {
      out[k] = v;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
