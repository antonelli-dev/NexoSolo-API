import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

import { FREELANCE_PROJECT_STATUSES } from '../project-status';

export class PatchProjectDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  name?: string;

  @IsOptional()
  @IsIn([...FREELANCE_PROJECT_STATUSES])
  status?: string;

  @IsOptional()
  @IsDateString()
  deadline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(24000)
  description?: string;

  @IsOptional()
  @IsDateString()
  acceptedScopeAt?: string;

  /** Stored project value (major units). Send `null` to clear and use invoice totals. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber()
  @Min(0)
  value?: number | null;

  /** Stored paid total (major units). Send `null` to clear; display prefers payment rows. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber()
  @Min(0)
  paidAmount?: number | null;
}
