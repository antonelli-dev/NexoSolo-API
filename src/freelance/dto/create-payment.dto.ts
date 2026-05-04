import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreatePaymentDto {
  @IsInt()
  @Min(1)
  @Max(999_999_999)
  amountCents!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
