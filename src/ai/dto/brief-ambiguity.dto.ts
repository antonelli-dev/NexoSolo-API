import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class BriefAmbiguityDto {
  @IsString()
  @MinLength(10)
  @MaxLength(20000)
  brief!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  scopeNotes?: string;
}
