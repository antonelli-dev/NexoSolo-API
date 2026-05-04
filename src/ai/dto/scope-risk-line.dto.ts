import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ScopeRiskLineDto {
  @IsString()
  @MinLength(5)
  @MaxLength(20000)
  scopeText!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  brief?: string;
}
