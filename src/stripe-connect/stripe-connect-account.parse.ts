/**
 * Narrow Stripe Connect Account objects delivered via webhooks (data.object as unknown JSON shape).
 */

export type StripeConnectAccountSnapshot = Readonly<{
  accountId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  profileIdFromMetadata: string | null;
}>;

function readMetadataProfileId(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  for (const [key, val] of Object.entries(value)) {
    if (key === 'profile_id' && typeof val === 'string' && val.length > 0) {
      return val;
    }
  }
  return null;
}

export function parseStripeConnectAccountFromWebhook(
  raw: Record<string, unknown>,
): StripeConnectAccountSnapshot | null {
  const id = raw['id'];
  if (typeof id !== 'string' || !id.startsWith('acct_')) {
    return null;
  }

  const chargesEnabled = raw['charges_enabled'] === true;
  const payoutsEnabled = raw['payouts_enabled'] === true;
  const detailsSubmitted = raw['details_submitted'] === true;
  const profileIdFromMetadata = readMetadataProfileId(raw['metadata']);

  return {
    accountId: id,
    chargesEnabled,
    payoutsEnabled,
    detailsSubmitted,
    profileIdFromMetadata,
  };
}
