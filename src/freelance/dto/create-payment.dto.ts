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

  /** Optional; also accepts HTTP header `Idempotency-Key` (header wins if both sent). */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  idempotencyKey?: string;
}
