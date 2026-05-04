import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateProjectDto {
  @IsUUID()
  clientId!: string;

  @IsString()
  @MaxLength(500)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(24000)
  description?: string;

  @IsOptional()
  @IsDateString()
  deadline?: string;

  /** Total project value in major units (e.g. euros), optional pipeline hint. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  value?: number;
}
