import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const SUPPORTED_CURRENCIES = ['EUR', 'USD', 'GBP', 'AUD', 'CAD', 'CHF', 'JPY', 'RUB', 'INR', 'MXN', 'BRL'] as const;

export class CreateQuoteDto {
  @IsString()
  clientId!: string;

  @IsString()
  @MaxLength(500)
  title!: string;

  @IsInt()
  @Min(0)
  @Max(999_999_999)
  amountCents!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(3)
  @IsIn(SUPPORTED_CURRENCIES)
  currency!: (typeof SUPPORTED_CURRENCIES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(32)
  status?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  scopeNotes?: string;
}
