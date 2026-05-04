import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class FairnessCheckDto {
  @IsString()
  @MaxLength(8000)
  workSummary!: string;

  @IsInt()
  @Min(0)
  amountChargedCents!: number;

  @IsString()
  @MaxLength(3)
  currency!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comparableMarketNotes?: string;
}
