import { plainToClass } from 'class-transformer';
import { IsString, IsOptional, IsUrl, IsNumber, IsBoolean, validateSync } from 'class-validator';

class EnvironmentVariables {
  @IsString()
  DATABASE_URL!: string;

  @IsUrl()
  @IsOptional()
  SUPABASE_URL?: string;

  @IsString()
  @IsOptional()
  SUPABASE_ANON_KEY?: string;

  @IsString()
  @IsOptional()
  SUPABASE_JWT_SECRET?: string;

  @IsString()
  @IsOptional()
  CORS_ORIGINS?: string;

  @IsNumber()
  @IsOptional()
  RATE_LIMIT_PER_MIN?: number;

  @IsBoolean()
  @IsOptional()
  ALLOW_DEBUG_USER_IMPERSONATION?: boolean;

  @IsString()
  @IsOptional()
  AI_PROVIDER?: string;

  @IsString()
  @IsOptional()
  AI_API_KEY?: string;

  @IsUrl()
  @IsOptional()
  AI_BASE_URL?: string;

  @IsString()
  @IsOptional()
  AI_MODEL?: string;

  @IsString()
  @IsOptional()
  RESEND_API_KEY?: string;

  @IsString()
  @IsOptional()
  RESEND_FROM?: string;

  /** Public API base URL (no trailing slash required) for signed invoice PDF links in emails / portal. */
  @IsUrl()
  @IsOptional()
  API_PUBLIC_URL?: string;

  @IsString()
  @IsOptional()
  JWT_CLIENT_SECRET?: string;

  @IsString()
  @IsOptional()
  SWAGGER?: string;

  /** ISO 3166-1 alpha-2 country for new Stripe Express accounts (e.g. ES, DE, US). */
  @IsString()
  @IsOptional()
  STRIPE_CONNECT_DEFAULT_COUNTRY?: string;

  /** Optional platform fee on Connect card payments, basis points (100 = 1%). */
  @IsString()
  @IsOptional()
  STRIPE_CONNECT_APPLICATION_FEE_BPS?: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToClass(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const errorMessages = errors.map(error => {
      const constraints = Object.values(error.constraints || {});
      return `${error.property}: ${constraints.join(', ')}`;
    });
    throw new Error(`Configuration validation error: ${errorMessages.join('; ')}`);
  }

  return validatedConfig;
}
