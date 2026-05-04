import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class RewriteScopeDto {
  @IsString()
  @MinLength(5)
  @MaxLength(20000)
  scopeText!: string;

  @IsIn(['clearer', 'tighter', 'client_friendly'])
  mode!: 'clearer' | 'tighter' | 'client_friendly';
}
