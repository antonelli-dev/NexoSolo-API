import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import * as jwt from 'jsonwebtoken';
import jwkToPem from 'jwk-to-pem';

type JwtPayload = {
  sub?: string;
  email?: string;
};

type AuthedRequest = Request & { user?: { sub: string; email?: string } };

type SupabaseJwks = {
  keys: Array<{
    kid: string;
    kty: string;
    use?: string;
    alg?: string;
    crv?: string;
    x?: string;
    y?: string;
    n?: string;
    e?: string;
  }>;
};

const JWKS_CACHE_TTL_MS = 60 * 60 * 1000; // 1h
let cachedJwks: SupabaseJwks | null = null;
let cachedJwksAtMs = 0;

function supabaseJwksFetchHeaders(): HeadersInit {
  const anon = process.env.SUPABASE_ANON_KEY?.trim();
  const h: Record<string, string> = { accept: 'application/json' };
  // Hosted Supabase returns 401 for `/auth/v1/keys` without a project API key.
  if (anon) {
    h.apikey = anon;
    h.Authorization = `Bearer ${anon}`;
  }
  return h;
}

async function getJwks(supabaseUrl: string): Promise<SupabaseJwks> {
  const now = Date.now();
  if (cachedJwks && now - cachedJwksAtMs < JWKS_CACHE_TTL_MS) {
    return cachedJwks;
  }

  const headers = supabaseJwksFetchHeaders();
  const primary = `${supabaseUrl}/auth/v1/keys`;
  let res = await fetch(primary, { headers });
  if (!res.ok && res.status === 404) {
    res = await fetch(`${supabaseUrl}/auth/v1/.well-known/jwks.json`, {
      headers,
    });
  }
  if (!res.ok) {
    throw new Error(`Failed to fetch Supabase JWKS: ${res.status}`);
  }

  const data = (await res.json()) as SupabaseJwks;
  cachedJwks = data;
  cachedJwksAtMs = now;
  return data;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const debugId = req.headers['x-debug-user-id'] as string | undefined;
    const isProd = process.env.NODE_ENV === 'production';
    const allowDebug =
      process.env.ALLOW_DEBUG_USER_IMPERSONATION === 'true' && !isProd;

    if (allowDebug && debugId?.length) {
      req.user = { sub: debugId.trim(), email: undefined };
      return true;
    }

    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = auth.slice('Bearer '.length).trim();
    try {
      const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
      if (!supabaseUrl) {
        throw new UnauthorizedException('Server missing SUPABASE_URL');
      }

      const decoded = jwt.decode(token, { complete: true }) as
        | { header?: { alg?: string; kid?: string }; payload?: unknown }
        | null;

      const alg = decoded?.header?.alg;
      if (!alg) throw new UnauthorizedException('Invalid token header');

      let payload: JwtPayload | undefined;

      if (alg === 'HS256') {
        // Hosted Supabase still issues many session JWTs with the project JWT secret (symmetric).
        const secret = process.env.SUPABASE_JWT_SECRET;
        if (!secret?.length) {
          throw new UnauthorizedException(
            'Server missing SUPABASE_JWT_SECRET (required for HS256 Supabase tokens)',
          );
        }
        payload = jwt.verify(token, secret, {
          algorithms: ['HS256'],
        }) as JwtPayload;
      } else {
        // Asymmetric keys (e.g. ES256): resolve public key via JWKS `kid`.
        const kid = decoded?.header?.kid;
        if (!kid) throw new UnauthorizedException('Invalid token header');

        if (!process.env.SUPABASE_ANON_KEY?.trim()) {
          throw new UnauthorizedException(
            'Server missing SUPABASE_ANON_KEY (required to fetch JWKS for ES256/RS256 tokens)',
          );
        }

        const jwks = await getJwks(supabaseUrl);
        const kidNorm = kid.toLowerCase();
        const jwk = jwks.keys.find(
          (k) => typeof k.kid === 'string' && k.kid.toLowerCase() === kidNorm,
        );
        if (!jwk) throw new UnauthorizedException('Invalid token key id');

        const pem = jwkToPem(jwk as any, {
          private: false,
        });

        const pubkeyAlg: jwt.Algorithm =
          alg === 'ES256' || alg === 'RS256' ? alg : 'ES256';

        payload = jwt.verify(token, pem, {
          algorithms: [pubkeyAlg],
        }) as JwtPayload;
      }

      if (!payload?.sub) throw new UnauthorizedException('Invalid token subject');

      req.user = { sub: payload.sub, email: payload.email };
      return true;
    } catch (e) {
      if (e instanceof UnauthorizedException) throw e;
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
