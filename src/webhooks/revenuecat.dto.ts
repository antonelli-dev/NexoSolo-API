import { IsString, IsBoolean, IsOptional, IsEnum } from 'class-validator';

export enum RevenueCatEventType {
  INITIAL_PURCHASE = 'INITIAL_PURCHASE',
  RENEWAL = 'RENEWAL',
  CANCELLATION = 'CANCELLATION',
  UNCANCELLATION = 'UNCANCELLATION',
  EXPIRATION = 'EXPIRATION',
  INVOICE_FAILURE = 'INVOICE_FAILURE',
  SUBSCRIPTION_EXTENDED = 'SUBSCRIPTION_EXTENDED',
  PRODUCT_CHANGE = 'PRODUCT_CHANGE',
}

export enum SubscriptionTier {
  FREE = 'free',
  PREMIUM = 'premium',
  PREMIUM_PLUS = 'premium_plus',
}

export class RevenueCatWebhookDto {
  @IsString()
  event_type!: RevenueCatEventType;

  @IsString()
  app_user_id!: string;

  @IsString()
  id!: string;

  @IsString()
  created_at!: string;

  @IsOptional()
  @IsString()
  product_id?: string;

  @IsOptional()
  @IsString()
  entitlement_id?: string;

  @IsOptional()
  @IsString()
  store?: string;

  @IsOptional()
  @IsBoolean()
  is_trial?: boolean;

  @IsOptional()
  @IsBoolean()
  is_introductory?: boolean;

  @IsOptional()
  @IsString()
  expiration_date?: string;

  @IsOptional()
  @IsString()
  original_transaction_id?: string;

  @IsOptional()
  @IsString()
  period_type?: string;

  @IsOptional()
  @IsBoolean()
  will_renew?: boolean;
}
