import { IsDateString, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreateProjectTaskDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title!: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  /** Manual ordering; omit to append. */
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
