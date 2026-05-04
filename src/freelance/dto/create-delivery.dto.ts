import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateDeliveryDto {
  @IsString()
  @MaxLength(200)
  label!: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  notes?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
}
