import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

const BUDGET_CATEGORIES = [
  'rent',
  'utilities',
  'subscriptions',
  'insurance',
  'software',
  'tax_reserve',
  'other',
] as const;

export class CreateBudgetExpenseDto {
  @IsString()
  @MaxLength(160)
  label!: string;

  @IsOptional()
  @IsString()
  @IsIn([...BUDGET_CATEGORIES])
  category?: (typeof BUDGET_CATEGORIES)[number];

  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
