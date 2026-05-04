import { Injectable, Logger } from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-side auth helpers. Uses Supabase Admin API when
 * SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  private getAdminClient(): SupabaseClient | null {
    const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return null;
    }
    return createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  /**
   * Revokes refresh tokens for this access token (global = all sessions for user).
   * Call before the client clears local session. Safe to skip if env is not configured.
   */
  async revokeRefreshSessions(accessToken: string): Promise<boolean> {
    const admin = this.getAdminClient();
    if (!admin) {
      this.logger.warn(
        'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing — server revoke skipped',
      );
      return false;
    }

    const { error } = await admin.auth.admin.signOut(accessToken, 'global');
    if (error) {
      this.logger.warn(`Supabase admin signOut: ${error.message}`);
      return false;
    }
    return true;
  }

  /** Signed URL for Supabase Storage (requires service role). */
  async createSignedStorageUrl(
    bucketId: string,
    objectPath: string,
    expiresSec = 3600,
  ): Promise<string | null> {
    const admin = this.getAdminClient();
    if (!admin) {
      return null;
    }
    const { data, error } = await admin.storage
      .from(bucketId)
      .createSignedUrl(objectPath, expiresSec);
    if (error || !data?.signedUrl) {
      this.logger.warn(`createSignedStorageUrl: ${error?.message ?? 'no URL'}`);
      return null;
    }
    return data.signedUrl;
  }
}
