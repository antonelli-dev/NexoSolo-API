import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateSavedBriefDto {
  @IsString()
  @MaxLength(500)
  title!: string;

  @IsString()
  @MaxLength(48000)
  content!: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  aiSummary?: string;
}
