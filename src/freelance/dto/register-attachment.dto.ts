import { IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class RegisterAttachmentDto {
  @IsIn(['client', 'project', 'invoice', 'invoice_payment'])
  entityType!: 'client' | 'project' | 'invoice' | 'invoice_payment';

  @IsUUID()
  entityId!: string;

  @IsString()
  @MaxLength(2048)
  objectPath!: string;

  @IsString()
  @MaxLength(512)
  fileName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  mimeType?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sizeBytes?: number;
}
