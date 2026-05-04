import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateActivityDto {
  @IsString()
  @MaxLength(32)
  kind!: string;

  @IsString()
  @MaxLength(500)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  body?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
