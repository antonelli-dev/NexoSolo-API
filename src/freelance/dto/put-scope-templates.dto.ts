import { ArrayMaxSize, IsArray } from 'class-validator';

/** Item shape validated in FreelanceService (ids generated if missing). */
export class PutScopeTemplatesDto {
  @IsArray()
  @ArrayMaxSize(50)
  templates!: unknown[];
}
