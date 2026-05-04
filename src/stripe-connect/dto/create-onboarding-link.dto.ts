import { IsString, MaxLength, IsUrl } from 'class-validator';

/** URLs for Stripe-hosted onboarding; must be HTTPS in production deployments. */
export class CreateStripeOnboardingLinkDto {
  @IsUrl({ require_tld: false })
  @IsString()
  @MaxLength(2048)
  refreshUrl!: string;

  @IsUrl({ require_tld: false })
  @IsString()
  @MaxLength(2048)
  returnUrl!: string;
}
