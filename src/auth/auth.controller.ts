import { Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';

import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

type AuthedRequest = Request & {
  user: { sub: string; email?: string };
};

@Controller('v1/auth')
export class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  /** Upsert `profiles` row from Supabase JWT (call after sign-in). */
  @Post('bootstrap')
  @UseGuards(JwtAuthGuard)
  bootstrap(
    @Req() req: AuthedRequest,
  ) {
    return this.prisma.profile.upsert({
      where: { id: req.user.sub },
      create: {
        id: req.user.sub,
        email: req.user.email ?? null,
      },
      update: {
        ...(req.user.email ? { email: req.user.email } : {}),
      },
    });
  }

  /**
   * Revokes Supabase refresh tokens for the current session (and others if scope global).
   * Client should still call `supabase.auth.signOut()` to clear local storage.
   * If service role env is missing, returns ok with revoked: false.
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@Req() req: AuthedRequest) {
    const auth = req.headers.authorization;
    const token =
      typeof auth === 'string' && auth.startsWith('Bearer ')
        ? auth.slice('Bearer '.length).trim()
        : '';

    if (!token) {
      return { ok: true as const, revoked: false };
    }

    const revoked = await this.auth.revokeRefreshSessions(token);
    return { ok: true as const, revoked };
  }
}
