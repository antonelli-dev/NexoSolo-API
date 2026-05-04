import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class PricingCoachDto {
  @IsString()
  @MaxLength(16_000)
  projectDescription!: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  deliverables?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  hoursWorked?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  hourlyRateCents?: number;

  @IsInt()
  @Min(0)
  quotedAmountCents!: number;

  @IsString()
  @MaxLength(3)
  currency!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  clientType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  urgency?: string;
}
