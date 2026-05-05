import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class PatchProjectTaskDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsBoolean()
  done?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  /** Send `null` to clear due date. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsDateString()
  dueAt?: string | null;
}
