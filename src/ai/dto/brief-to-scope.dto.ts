import { IsOptional, IsString, MaxLength } from 'class-validator';

export class BriefToScopeDto {
  @IsString()
  @MaxLength(24_000)
  brief!: string;

  @IsOptional()
  @IsString()
  @MaxLength(12_000)
  scopeNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  priceHint?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;
}
